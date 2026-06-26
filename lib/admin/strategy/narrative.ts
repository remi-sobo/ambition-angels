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
import { getFinanceSnapshot, fiscalYearBounds } from "@/lib/admin/finance";
import { planHealthToStatus, type Status } from "@/lib/admin/status";

const ORG = (orgId: string) => orgId;

// Open pipeline stages that carry a probability-weighted ask. A whitelist, so
// steward / lost / won (and any future stage) are excluded unless added here —
// the "one dollar, one state" guard.
const OPEN_STAGES = ["identify", "qualify", "cultivate", "solicit"] as const;

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

export type PlanMovement = {
  foundation: { mission: string | null; vision: string | null } | null;
  objectives: NarrativeObjective[];
};

// ── Movement 1: The Plan ─────────────────────────────────────────────────────

export async function getPlanMovement(orgId: string): Promise<PlanMovement> {
  const sb = getSupabaseAdmin();
  const [foundationRes, objectivesRes, goalsRes, kpisRes, initiativesRes] = await Promise.all([
    sb.from("plan_foundation").select("mission, vision").eq("org_id", ORG(orgId)).maybeSingle(),
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

  const kpisByGoal = new Map<string, NarrativeKpi[]>();
  const kpisByObjectiveDirect = new Map<string, NarrativeKpi[]>();
  for (const k of kpis) {
    const kpi = toKpi(k);
    if (k.goal_id) {
      const arr = kpisByGoal.get(k.goal_id as string) ?? [];
      arr.push(kpi);
      kpisByGoal.set(k.goal_id as string, arr);
    } else if (k.objective_id) {
      const arr = kpisByObjectiveDirect.get(k.objective_id as string) ?? [];
      arr.push(kpi);
      kpisByObjectiveDirect.set(k.objective_id as string, arr);
    }
  }

  const goalsByObjective = new Map<string, NarrativeGoal[]>();
  for (const g of goals) {
    if (!g.objective_id) continue;
    const arr = goalsByObjective.get(g.objective_id as string) ?? [];
    arr.push({
      id: g.id as string,
      title: g.title as string,
      description: (g.description as string | null) ?? null,
      status: planHealthToStatus(g.status as string | null),
      owner: (g.owner as string | null) ?? null,
      initiatives: initiativesByGoal.get(g.id as string) ?? [],
      kpis: kpisByGoal.get(g.id as string) ?? [],
    });
    goalsByObjective.set(g.objective_id as string, arr);
  }

  const objectives: NarrativeObjective[] = (objectivesRes.data ?? []).map((o) => ({
    id: o.id as string,
    title: o.title as string,
    statement: (o.three_year_statement as string | null) ?? null,
    owner: (o.owner as string | null) ?? null,
    status: planHealthToStatus(o.status as string | null),
    goals: goalsByObjective.get(o.id as string) ?? [],
    objectiveKpis: kpisByObjectiveDirect.get(o.id as string) ?? [],
  }));

  const foundation = foundationRes.data
    ? { mission: (foundationRes.data.mission as string | null) ?? null, vision: (foundationRes.data.vision as string | null) ?? null }
    : null;

  return { foundation, objectives };
}

// ── Movement 2: What We Need to Raise ────────────────────────────────────────

export type AllocationGroup = { group: string; base: number; stagedT1: number; stagedT2: number };

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
  cashOnHand: number;
  runwayMonths: number | null;
  /** Where the committed floor + staged tiers go (fin_budget by category group). */
  allocation: AllocationGroup[];
  allocationFloorTotal: number; // Σ base across groups (the committed floor)
};

export async function getRaiseMovement(orgId: string): Promise<MoneySummary> {
  const sb = getSupabaseAdmin();
  const fin = await getFinanceSnapshot();
  const fy = fiscalYearBounds(fin.cfg.year, fin.cfg.startMonth);

  const [targetsRes, giftsRes, oppsRes, budgetRes, catsRes] = await Promise.all([
    sb.from("plan_kpis").select("metric_key, target").eq("org_id", ORG(orgId)).in("metric_key", [METRIC.floor, METRIC.ceiling]),
    sb.from("gifts").select("amount").eq("org_id", ORG(orgId)).gte("gift_date", fy.start).lte("gift_date", fy.end),
    sb.from("opportunities").select("stage, ask_amount, probability").eq("org_id", ORG(orgId)).in("stage", OPEN_STAGES as unknown as string[]),
    sb.from("fin_budget").select("category_id, base_amount, contingency_t1, contingency_t2").eq("org_id", ORG(orgId)).eq("year", fin.cfg.year),
    sb.from("fin_categories").select("id, group_name, kind, enabled").eq("org_id", ORG(orgId)),
  ]);

  const targetOf = (key: string): number | null => {
    const row = (targetsRes.data ?? []).find((r) => r.metric_key === key);
    return row?.target == null ? null : Number(row.target);
  };
  const floor = targetOf(METRIC.floor);
  const ceiling = targetOf(METRIC.ceiling);

  const secured = (giftsRes.data ?? []).reduce((s, g) => s + Number(g.amount ?? 0), 0);

  // One dollar, one state: only OPEN_STAGES contribute, each weighted once.
  const weightedPipeline = (oppsRes.data ?? []).reduce((s, o) => {
    const ask = Number(o.ask_amount ?? 0);
    const p = o.probability == null ? 50 : Number(o.probability);
    return s + ask * (p / 100);
  }, 0);

  // Allocation: budget lines grouped by category group, expense categories only.
  const groupOfCat = new Map<string, string>();
  for (const c of catsRes.data ?? []) {
    if (c.kind === "expense" && c.enabled !== false) groupOfCat.set(c.id as string, c.group_name as string);
  }
  const allocMap = new Map<string, AllocationGroup>();
  for (const b of budgetRes.data ?? []) {
    const group = groupOfCat.get(b.category_id as string);
    if (!group) continue;
    const row = allocMap.get(group) ?? { group, base: 0, stagedT1: 0, stagedT2: 0 };
    row.base += Number(b.base_amount ?? 0);
    row.stagedT1 += Number(b.contingency_t1 ?? 0);
    row.stagedT2 += Number(b.contingency_t2 ?? 0);
    allocMap.set(group, row);
  }
  const allocation = Array.from(allocMap.values()).sort((a, b) => b.base - a.base);
  const allocationFloorTotal = allocation.reduce((s, a) => s + a.base, 0);

  return {
    floor,
    ceiling,
    secured,
    weightedPipeline,
    gap: floor == null ? null : Math.max(0, floor - secured),
    realistic: secured + weightedPipeline,
    cashOnHand: fin.cashOnHand,
    runwayMonths: fin.runwayMonths,
    allocation,
    allocationFloorTotal,
  };
}

// ── Movement 3: How We Raise It ──────────────────────────────────────────────

export type FunderAngle = {
  id: string;
  key: string;
  name: string;
  hook: string | null;
  ask: string | null;
  approach: string | null;
  /** Live funnel: funders shortlisted/qualified against this angle. */
  funderCount: number;
};

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
    sb.from("strategy_angles").select("id, key, name, hook, ask, approach").eq("org_id", ORG(orgId)).order("sort_order"),
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
    approach: (a.approach as string | null) ?? null,
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
