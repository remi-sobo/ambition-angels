/**
 * Strategy Narrative — the read layer (spec: specs/strategy-narrative.md,
 * recon: docs/bloomos/strategy-narrative-phase0-recon.md).
 *
 * One server module that returns the three movements as typed data:
 *   1. The Plan          — getPlanMovement(orgId)
 *   2. What We Raise      — getRaiseMovement(orgId)
 *   3. How We Raise It    — getHowMovement(orgId)
 *
 * Phase 1 is data only — no UI, no route. Every read is org-scoped on the
 * service-role client and happens server-side; nothing is cached here on
 * purpose (the spec's "stale targets after a reseed" guard — the surface reads
 * live on each load).
 *
 * Invariants this module enforces:
 *   - TARGETS come from the OGSM (`plan_kpis.target` by `metric_key`); ACTUALS
 *     are computed from finance. The two never drift because they have
 *     different sources. We never surface `plan_kpis.current` as the live raise.
 *   - ONE DOLLAR, ONE STATE. The ask whitelists open stages only
 *     (identify/qualify/cultivate/solicit); `steward`, `lost`, and `won` are
 *     excluded by construction, so a dollar is counted in exactly one state
 *     (realized via gifts, or open-weighted via the pipeline — never both).
 *     This is deliberately NOT lib/admin/overview/sources.ts::getForecast(),
 *     which counts steward at full value.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getFinanceSnapshot } from "@/lib/admin/finance";
import { planHealthToStatus, type Status } from "@/lib/admin/status";
import { deriveHealth } from "@/lib/admin/plan/health";
import { FINANCE } from "@/lib/admin/thresholds";
import { computeSecuredFy, computeWeightedPipeline } from "@/lib/admin/strategy/money";

const ORG = (orgId: string) => orgId;

// Metric keys the Raise + How movements read targets from. These are seeded by
// supabase/migrations/2026_ogsm_reseed.MANUAL.sql; reads degrade to null when a
// key is absent (e.g. before the reseed is applied).
const METRIC = {
  floor: "dollars_raised_fy26",
  ceiling: "dollars_ceiling_fy26",
  runwayMonths: "cash_runway_months",
  corporate: "corporate_raised",
  aigMultiyear: "aig_multiyear_commitments",
} as const;

// KPIs whose metric_key carries this prefix are the floor's source decomposition
// (foundations / corporate / individual). They power the "How the floor is
// sourced" block in Movement 2 and are deliberately excluded from the Movement 1
// measure lists, so a $510K source target never renders as a "Not started" KPI.
const FLOOR_SOURCE_PREFIX = "floor_source_";

// ── Shared row shapes (a thin slice of plan_* — see PlanControls.tsx) ────────

export type NarrativeKpi = {
  id: string;
  title: string;
  unit: string | null;
  target: number | null;
  current: number | null;
  status: Status;
  metricKey: string | null;
  owner: string | null;
};

export type NarrativeInitiative = {
  id: string;
  title: string;
  owner: string | null;
  status: string;
};

export type NarrativeGoal = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  owner: string | null;
  initiatives: NarrativeInitiative[];
  kpis: NarrativeKpi[];
};

export type NarrativeObjective = {
  id: string;
  title: string;
  statement: string | null;
  owner: string | null;
  status: Status;
  goals: NarrativeGoal[];
  /** KPIs attached straight to the objective (goal_id null) — e.g. the WALL numbers. */
  objectiveKpis: NarrativeKpi[];
};

/** A proof point shown before the plan — editable on plan_foundation. */
export type ProofPoint = { value: string; label: string };

export type PlanMovement = {
  foundation: { mission: string | null; vision: string | null; proofPoints: ProofPoint[] } | null;
  objectives: NarrativeObjective[];
};

// ── Movement 1: The Plan ─────────────────────────────────────────────────────

export async function getPlanMovement(orgId: string): Promise<PlanMovement> {
  const sb = getSupabaseAdmin();
  const [foundationRes, objectivesRes, goalsRes, kpisRes, initiativesRes] = await Promise.all([
    sb.from("plan_foundation").select("mission, vision, proof_points").eq("org_id", ORG(orgId)).maybeSingle(),
    sb.from("plan_objectives").select("id, title, three_year_statement, owner, status").eq("org_id", ORG(orgId)).order("sort_order").order("created_at"),
    sb.from("plan_goals").select("id, objective_id, title, description, owner, status").eq("org_id", ORG(orgId)).order("sort_order").order("created_at"),
    sb.from("plan_kpis").select("id, goal_id, objective_id, title, unit, target, current, status, metric_key, owner").eq("org_id", ORG(orgId)).order("created_at"),
    sb.from("plan_initiatives").select("id, goal_id, title, owner, status").eq("org_id", ORG(orgId)).order("sort_order").order("created_at"),
  ]);

  const goals = goalsRes.data ?? [];
  const kpis = kpisRes.data ?? [];
  const initiatives = initiativesRes.data ?? [];

  const toKpi = (k: (typeof kpis)[number]): NarrativeKpi => ({
    id: k.id as string,
    title: k.title as string,
    unit: (k.unit as string | null) ?? null,
    target: k.target == null ? null : Number(k.target),
    current: k.current == null ? null : Number(k.current),
    status: planHealthToStatus(k.status as string | null),
    metricKey: (k.metric_key as string | null) ?? null,
    owner: (k.owner as string | null) ?? null,
  });

  const initiativesByGoal = new Map<string, NarrativeInitiative[]>();
  for (const i of initiatives) {
    const arr = initiativesByGoal.get(i.goal_id as string) ?? [];
    arr.push({ id: i.id as string, title: i.title as string, owner: (i.owner as string | null) ?? null, status: i.status as string });
    initiativesByGoal.set(i.goal_id as string, arr);
  }

  // Raw plan-health strings (behind / at_risk / on_track / not_started) kept
  // alongside the display KPIs so objective/goal status can be ROLLED UP from
  // the measures (worst-leaf-wins) instead of trusting a hand-set headline — a
  // green objective can no longer sit on top of a Behind KPI.
  const kpisByGoal = new Map<string, NarrativeKpi[]>();
  const kpisByObjectiveDirect = new Map<string, NarrativeKpi[]>();
  const rawByGoal = new Map<string, string[]>();
  const rawByObjectiveDirect = new Map<string, string[]>();
  for (const k of kpis) {
    // Source-decomposition KPIs are sourcing targets, not progress measures:
    // keep them out of the plan tree and the roll-up entirely.
    if ((k.metric_key as string | null)?.startsWith(FLOOR_SOURCE_PREFIX)) continue;
    const kpi = toKpi(k);
    const raw = (k.status as string | null) ?? "not_started";
    if (k.goal_id) {
      const arr = kpisByGoal.get(k.goal_id as string) ?? [];
      arr.push(kpi);
      kpisByGoal.set(k.goal_id as string, arr);
      const rarr = rawByGoal.get(k.goal_id as string) ?? [];
      rarr.push(raw);
      rawByGoal.set(k.goal_id as string, rarr);
    } else if (k.objective_id) {
      const arr = kpisByObjectiveDirect.get(k.objective_id as string) ?? [];
      arr.push(kpi);
      kpisByObjectiveDirect.set(k.objective_id as string, arr);
      const rarr = rawByObjectiveDirect.get(k.objective_id as string) ?? [];
      rarr.push(raw);
      rawByObjectiveDirect.set(k.objective_id as string, rarr);
    }
  }

  // Roll a set of raw KPI statuses up to a display Status. With measures, the
  // worst leaf wins (deriveHealth); with no measures at all, fall back to the
  // stored health so an initiative-only goal isn't wrongly blanked to neutral.
  const rollup = (raw: string[], stored: string | null): Status =>
    raw.length ? planHealthToStatus(deriveHealth(raw) ?? "not_started") : planHealthToStatus(stored);

  const goalsByObjective = new Map<string, NarrativeGoal[]>();
  for (const g of goals) {
    if (!g.objective_id) continue;
    const arr = goalsByObjective.get(g.objective_id as string) ?? [];
    arr.push({
      id: g.id as string,
      title: g.title as string,
      description: (g.description as string | null) ?? null,
      status: rollup(rawByGoal.get(g.id as string) ?? [], g.status as string | null),
      owner: (g.owner as string | null) ?? null,
      initiatives: initiativesByGoal.get(g.id as string) ?? [],
      kpis: kpisByGoal.get(g.id as string) ?? [],
    });
    goalsByObjective.set(g.objective_id as string, arr);
  }

  const objectives: NarrativeObjective[] = (objectivesRes.data ?? []).map((o) => {
    const goalsHere = goalsByObjective.get(o.id as string) ?? [];
    // Objective health rolls up every measure beneath it: its goals' KPIs plus
    // any KPI attached straight to the objective.
    const raw = [
      ...goalsHere.flatMap((g) => rawByGoal.get(g.id) ?? []),
      ...(rawByObjectiveDirect.get(o.id as string) ?? []),
    ];
    return {
      id: o.id as string,
      title: o.title as string,
      statement: (o.three_year_statement as string | null) ?? null,
      owner: (o.owner as string | null) ?? null,
      status: rollup(raw, o.status as string | null),
      goals: goalsHere,
      objectiveKpis: kpisByObjectiveDirect.get(o.id as string) ?? [],
    };
  });

  // Proof points are stored as a jsonb array of { value, label }; coerce
  // defensively so a malformed row never breaks the render.
  const rawProof = foundationRes.data?.proof_points;
  const proofPoints: ProofPoint[] = Array.isArray(rawProof)
    ? rawProof
        .map((p) => ({ value: String((p as ProofPoint)?.value ?? "").trim(), label: String((p as ProofPoint)?.label ?? "").trim() }))
        .filter((p) => p.value)
    : [];
  const foundation = foundationRes.data
    ? {
        mission: (foundationRes.data.mission as string | null) ?? null,
        vision: (foundationRes.data.vision as string | null) ?? null,
        proofPoints,
      }
    : null;

  return { foundation, objectives };
}

// ── Movement 2: What We Need to Raise ────────────────────────────────────────

/** A budget line inside an allocation group (fin_categories.display_name + base). */
export type AllocationLine = { label: string; amount: number };
export type AllocationGroup = { group: string; base: number; stagedT1: number; stagedT2: number; lines: AllocationLine[] };

/** A funding source: a channel target the committed floor is raised against. */
export type FundingSource = { label: string; amount: number };

export type MoneySummary = {
  /** Targets from the OGSM (plan_kpis); null when the metric_key is unseeded. */
  floor: number | null;
  ceiling: number | null;
  /** Actuals computed from finance, never from plan_kpis.current. */
  secured: number; // Σ gifts in FY (realized dollars)
  weightedPipeline: number; // Σ open-stage ask × prob/100 (open-weighted dollars)
  /** Derived. gap is null when there is no floor target to subtract from. */
  gap: number | null; // max(0, floor − secured)
  realistic: number; // secured + weightedPipeline (each dollar counted once)
  /** Net-new still to source after a realistic close — the residual coverage to develop. */
  residual: number | null; // max(0, floor − realistic)
  cashOnHand: number;
  runwayMonths: number | null;
  /** Near-term bridge: dollars to restore a healthy runway, distinct from the annual floor. */
  monthlyBurn: number;
  runwayTargetMonths: number;
  runwayBridge: number; // max(0, target months × burn − cash on hand)
  /** Where the floor is RAISED FROM — channel targets summing to the floor. */
  sources: FundingSource[];
  /** Where the committed floor + staged tiers GO (fin_budget by category group, with line detail). */
  allocation: AllocationGroup[];
  allocationFloorTotal: number; // Σ base across groups (the committed floor)
  /** The raised figure at/above which the staged tiers unlock (threshold × floor). */
  stagedUnlockAt: number | null;
};

export async function getRaiseMovement(orgId: string): Promise<MoneySummary> {
  const sb = getSupabaseAdmin();
  const fin = await getFinanceSnapshot();

  // Actuals from the shared money module — the same functions the scorecard's
  // auto-metrics refresh from, so the narrative and the scorecard can't drift.
  const [targetsRes, sourcesRes, secured, weightedPipeline, budgetRes, catsRes, cfgRes] = await Promise.all([
    sb.from("plan_kpis").select("metric_key, target").eq("org_id", ORG(orgId)).in("metric_key", [METRIC.floor, METRIC.ceiling]),
    sb.from("plan_kpis").select("title, target, metric_key").eq("org_id", ORG(orgId)).like("metric_key", `${FLOOR_SOURCE_PREFIX}%`),
    computeSecuredFy(sb, orgId),
    computeWeightedPipeline(sb, orgId),
    sb.from("fin_budget").select("category_id, base_amount, contingency_t1, contingency_t2").eq("org_id", ORG(orgId)).eq("year", fin.cfg.year),
    sb.from("fin_categories").select("id, group_name, display_name, kind, enabled").eq("org_id", ORG(orgId)),
    sb.from("fin_config").select("contingency_unlock_threshold").eq("org_id", ORG(orgId)).maybeSingle(),
  ]);

  const targetOf = (key: string): number | null => {
    const row = (targetsRes.data ?? []).find((r) => r.metric_key === key);
    return row?.target == null ? null : Number(row.target);
  };
  const floor = targetOf(METRIC.floor);
  const ceiling = targetOf(METRIC.ceiling);

  // Where the floor is RAISED FROM — channel targets that sum to the floor.
  const sources: FundingSource[] = (sourcesRes.data ?? [])
    .map((r) => ({ label: r.title as string, amount: Number(r.target ?? 0) }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // Allocation: budget lines grouped by category group, expense categories only.
  // Each group keeps its line detail (display_name + base) so a featured number
  // like the $400K platform build shows as a line, not buried in a group total.
  const catMeta = new Map<string, { group: string; label: string }>();
  for (const c of catsRes.data ?? []) {
    if (c.kind === "expense" && c.enabled !== false)
      catMeta.set(c.id as string, { group: c.group_name as string, label: (c.display_name as string) ?? (c.group_name as string) });
  }
  const allocMap = new Map<string, AllocationGroup>();
  for (const b of budgetRes.data ?? []) {
    const meta = catMeta.get(b.category_id as string);
    if (!meta) continue;
    const row = allocMap.get(meta.group) ?? { group: meta.group, base: 0, stagedT1: 0, stagedT2: 0, lines: [] };
    const base = Number(b.base_amount ?? 0);
    row.base += base;
    row.stagedT1 += Number(b.contingency_t1 ?? 0);
    row.stagedT2 += Number(b.contingency_t2 ?? 0);
    if (base > 0) row.lines.push({ label: meta.label, amount: base });
    allocMap.set(meta.group, row);
  }
  const allocation = Array.from(allocMap.values())
    .map((g) => ({ ...g, lines: g.lines.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.base - a.base);
  const allocationFloorTotal = allocation.reduce((s, a) => s + a.base, 0);

  // Near-term runway bridge: dollars to restore a healthy cushion (target months
  // of burn), held separate from the annual floor. Burn = the settable baseline,
  // falling back to trailing 3-month burn; target = the finance watch line.
  const monthlyBurn = fin.cfg.baseline ?? fin.burn3mo;
  const runwayTargetMonths = FINANCE.runwayWatchMonths;
  const runwayBridge = Math.max(0, runwayTargetMonths * monthlyBurn - fin.cashOnHand);

  // Staged tiers unlock once the raise clears threshold × floor (fin_config).
  const unlockThreshold = cfgRes.data?.contingency_unlock_threshold == null ? null : Number(cfgRes.data.contingency_unlock_threshold);
  const stagedUnlockAt = floor != null && unlockThreshold != null ? Math.round(floor * unlockThreshold) : null;

  const realistic = secured + weightedPipeline;
  return {
    floor,
    ceiling,
    secured,
    weightedPipeline,
    gap: floor == null ? null : Math.max(0, floor - secured),
    realistic,
    residual: floor == null ? null : Math.max(0, floor - realistic),
    cashOnHand: fin.cashOnHand,
    runwayMonths: fin.runwayMonths,
    monthlyBurn,
    runwayTargetMonths,
    runwayBridge,
    sources,
    allocation,
    allocationFloorTotal,
    stagedUnlockAt,
  };
}

// ── Movement 3: How We Raise It ──────────────────────────────────────────────

export type FunderAngle = {
  id: string;
  key: string;
  name: string;
  hook: string | null;
  ask: string | null;
  /** Live funnel: funders shortlisted/qualified against this angle. */
  funderCount: number;
};
// CONTRACT (B2-3): this funder-facing read selects ONLY funder-safe columns.
// Internal strategy (`approach`, and any future `internal_notes`) is never
// fetched here, so it cannot leak into the Narrative no matter what a component
// later chooses to render. The internal strategy board reads strategy_angles
// directly on its own surface; this one does not.

export type PipelineStageBucket = { stage: string; count: number; askTotal: number };

export type ChannelProgress = { metricKey: string; title: string; target: number | null; current: number | null; unit: string | null; status: Status };

export type HowMovement = {
  angles: FunderAngle[];
  pipelineByStage: PipelineStageBucket[];
  channels: ChannelProgress[];
};

export async function getHowMovement(orgId: string): Promise<HowMovement> {
  const sb = getSupabaseAdmin();
  const [anglesRes, funderRes, oppsRes, channelRes] = await Promise.all([
    sb.from("strategy_angles").select("id, key, name, hook, ask").eq("org_id", ORG(orgId)).order("sort_order"),
    sb.from("funder_angles").select("angle_id").eq("org_id", ORG(orgId)),
    sb.from("opportunities").select("stage, ask_amount").eq("org_id", ORG(orgId)).neq("stage", "lost"),
    sb.from("plan_kpis").select("metric_key, title, target, current, unit, status").eq("org_id", ORG(orgId)).in("metric_key", [METRIC.corporate, METRIC.aigMultiyear]),
  ]);

  const countByAngle = new Map<string, number>();
  for (const f of funderRes.data ?? []) {
    const k = f.angle_id as string;
    countByAngle.set(k, (countByAngle.get(k) ?? 0) + 1);
  }

  const angles: FunderAngle[] = (anglesRes.data ?? []).map((a) => ({
    id: a.id as string,
    key: a.key as string,
    name: a.name as string,
    hook: (a.hook as string | null) ?? null,
    ask: (a.ask as string | null) ?? null,
    funderCount: countByAngle.get(a.id as string) ?? 0,
  }));

  const stageMap = new Map<string, PipelineStageBucket>();
  for (const o of oppsRes.data ?? []) {
    const stage = o.stage as string;
    const row = stageMap.get(stage) ?? { stage, count: 0, askTotal: 0 };
    row.count += 1;
    row.askTotal += Number(o.ask_amount ?? 0);
    stageMap.set(stage, row);
  }
  // Order by the live fundraising funnel, unknown stages last.
  const STAGE_ORDER = ["identify", "qualify", "cultivate", "solicit", "steward"];
  const pipelineByStage = Array.from(stageMap.values()).sort(
    (a, b) => (STAGE_ORDER.indexOf(a.stage) + 1 || 99) - (STAGE_ORDER.indexOf(b.stage) + 1 || 99),
  );

  const channels: ChannelProgress[] = (channelRes.data ?? []).map((c) => ({
    metricKey: c.metric_key as string,
    title: c.title as string,
    target: c.target == null ? null : Number(c.target),
    current: c.current == null ? null : Number(c.current),
    unit: (c.unit as string | null) ?? null,
    status: planHealthToStatus(c.status as string | null),
  }));

  return { angles, pipelineByStage, channels };
}
