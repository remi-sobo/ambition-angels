/**
 * Overview data sources — one cached loader per widget data source.
 *
 * The role views (CEO cockpit / Ops control panel) are arrangements of
 * self-contained widget components; each widget reads exactly one of these
 * loaders. Every loader is wrapped in React `cache()`, so when both views are
 * rendered for the role pill (the active one shown, the other kept mounted to
 * peek), a shared source — finance, say — is still queried only once per
 * request.
 *
 * Client policy: the fundraising spine (opportunities / gifts / constituents /
 * interactions) is read under the user-session client — the same path the rest
 * of the fundraising module already uses. RLS admits rows from EVERY org the
 * user belongs to, not just the active one, so each session-client loader also
 * resolves the active org (`getOrgContext`) and filters `.eq("org_id", …)`
 * explicitly. Finance and the legacy donations/ops/analytics reads carried
 * over from the old Command Center stay on the service-role client until those
 * modules' RLS conversion lands; switching them here would be a behavior
 * change outside this spec.
 */
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAdminUser, getOrgContext } from "@/lib/admin/auth";
import { deriveHealth, isOffTrack } from "@/lib/admin/plan/health";
import { constituentName } from "@/lib/fundraising/display";
import { todayISO, priorityRank, type TaskPriority } from "@/app/admin/ops/_types/ops";
import {
  OPEN_COMPLIANCE_STATUSES,
  complianceQueueHorizon,
  complianceQueueEntry,
  type ComplianceQueueSource,
} from "@/lib/admin/overview/complianceQueue";
import { getDataAge } from "@/lib/admin/dataAge";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { OPEN_STAGE_LIST, isWonStage } from "@/lib/fundraising/stage-sets";
import {
  getFinanceSnapshot,
  fiscalYearBounds,
  type FinanceSnapshot,
  type MonthBucket as FinMonthBucket,
} from "@/lib/admin/finance";

// ── Finance: delegates to the canonical snapshot (lib/admin/finance.ts) so the
// CEO cockpit, the Finance dashboard, and the briefing engine all read cash,
// burn, runway, and the monthly series from one place — they can't drift. ─────

export type MonthBucket = FinMonthBucket;
export type FinanceData = FinanceSnapshot;

/** Cash, burn, runway and the monthly revenue/expense/ending series. */
export const getFinance = getFinanceSnapshot;

// ── Recent donations (legacy Stripe feed) ────────────────────────────────────

export type DonationRow = {
  created_at: string;
  amount: number;
  recurring: boolean | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
};

export const getRecentDonations = cache(async (): Promise<DonationRow[]> => {
  const sb = getSupabaseAdmin();
  const res = await sb
    .from("donations")
    .select("created_at, amount, recurring, first_name, last_name, name, email, status")
    .order("created_at", { ascending: false })
    .limit(10);
  return (res.data ?? [])
    .filter((d: { status: string | null }) => !d.status || d.status === "succeeded")
    .map((d) => ({
      created_at: d.created_at as string,
      amount: Number(d.amount),
      recurring: (d.recurring as boolean | null) ?? null,
      first_name: (d.first_name as string | null) ?? null,
      last_name: (d.last_name as string | null) ?? null,
      name: (d.name as string | null) ?? null,
      email: (d.email as string | null) ?? null,
    }));
});

// ── Strategy rollup: four objective tiles + the OGSM review nudge (Phase 4) ──
// Org-scoped (the plan is multi-tenant). Each objective's health rolls up from
// its KPIs by exception, honoring a manually-set objective status too.

export type StrategyHeadlineKpi = {
  id: string;
  title: string;
  unit: string | null;
  target: number;
  current: number;
  status: string;
  owner: string | null;
  pct: number;
  /** The objective this measure rolls up to (direct, or via its goal). */
  objectiveId: string | null;
  objectiveTitle: string | null;
};

export type StrategyObjectiveTile = {
  id: string;
  title: string;
  owner: string | null;
  /** not_started | on_track | at_risk | behind | done */
  health: string;
  /** how many of this objective's KPIs are at_risk/behind */
  kpisOffTrack: number;
  /** Up to three target-bearing measures, off-track first (for the Org grid). */
  measures: StrategyHeadlineKpi[];
};

export type StrategyRollup = {
  hasPlan: boolean;
  objectives: StrategyObjectiveTile[];
  /** A handful of target-bearing KPIs for the home summary — off-track first. */
  headlineKpis: StrategyHeadlineKpi[];
  nextReviewAt: string | null;
  lastReviewAt: string | null;
};

export const getStrategyRollup = cache(async (): Promise<StrategyRollup> => {
  const ctx = await getOrgContext();
  if (!ctx) return { hasPlan: false, objectives: [], headlineKpis: [], nextReviewAt: null, lastReviewAt: null };
  const sb = getSupabaseAdmin();
  const orgId = ctx.orgId;

  const [objsRes, goalsRes, kpisRes, reviewRes] = await Promise.all([
    sb.from("plan_objectives").select("id, title, status, status_override, owner").eq("org_id", orgId).order("sort_order").order("created_at"),
    sb.from("plan_goals").select("id, objective_id").eq("org_id", orgId),
    sb.from("plan_kpis").select("id, goal_id, objective_id, status, title, unit, target, current, owner").eq("org_id", orgId),
    // Resilient if plan_reviews isn't migrated yet (error → data null).
    sb.from("plan_reviews").select("conducted_at, next_review_at").eq("org_id", orgId).order("conducted_at", { ascending: false }).limit(1),
  ]);

  const goalObjective = new Map(
    ((goalsRes.data ?? []) as { id: string; objective_id: string | null }[]).map((g) => [g.id, g.objective_id])
  );
  const objRows = (objsRes.data ?? []) as { id: string; title: string; status: string; status_override: string | null; owner: string | null }[];
  const objTitleById = new Map(objRows.map((o) => [o.id, o.title]));
  type KpiRow = {
    id: string; goal_id: string | null; objective_id: string | null; status: string;
    title: string; unit: string | null; target: number | null; current: number | null; owner: string | null;
  };
  const kpiRows = (kpisRes.data ?? []) as KpiRow[];
  const objectiveOfKpi = (k: KpiRow): string | null =>
    k.objective_id ?? (k.goal_id ? goalObjective.get(k.goal_id) ?? null : null);

  const statusesByObjective = new Map<string, string[]>();
  for (const k of kpiRows) {
    const objId = objectiveOfKpi(k);
    if (!objId) continue;
    const arr = statusesByObjective.get(objId) ?? [];
    arr.push(k.status);
    statusesByObjective.set(objId, arr);
  }

  // Off-track first, then lowest % to target — the shared "what needs attention"
  // ordering, used for both the global headline list and each objective's tiles.
  const byNeed = (a: StrategyHeadlineKpi, b: StrategyHeadlineKpi) => {
    const ao = isOffTrack(a.status) ? 0 : 1;
    const bo = isOffTrack(b.status) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.pct - b.pct;
  };

  // Every target-bearing KPI, tagged with the objective it rolls up to.
  const targetKpis: StrategyHeadlineKpi[] = kpiRows
    .filter((k) => k.target != null && Number(k.target) > 0)
    .map((k) => {
      const target = Number(k.target);
      const current = k.current == null ? 0 : Number(k.current);
      const objId = objectiveOfKpi(k);
      return {
        id: k.id,
        title: k.title,
        unit: k.unit,
        target,
        current,
        status: k.status,
        owner: k.owner,
        pct: Math.max(0, Math.min(100, Math.round((current / target) * 100))),
        objectiveId: objId,
        objectiveTitle: objId ? objTitleById.get(objId) ?? null : null,
      };
    });

  const headlineKpis = [...targetKpis].sort(byNeed).slice(0, 5);

  const measuresByObjective = new Map<string, StrategyHeadlineKpi[]>();
  for (const k of targetKpis) {
    if (!k.objectiveId) continue;
    const arr = measuresByObjective.get(k.objectiveId) ?? [];
    arr.push(k);
    measuresByObjective.set(k.objectiveId, arr);
  }

  const objectives: StrategyObjectiveTile[] = objRows.map((o) => {
    const sts = statusesByObjective.get(o.id) ?? [];
    return {
      id: o.id,
      title: o.title,
      owner: o.owner ?? null,
      // Effective health: a reasoned override wins, else the worst measure, else stored (B2-1).
      health: o.status_override ?? deriveHealth(sts) ?? o.status,
      kpisOffTrack: sts.filter((s) => isOffTrack(s)).length,
      measures: [...(measuresByObjective.get(o.id) ?? [])].sort(byNeed).slice(0, 3),
    };
  });

  const latest = ((reviewRes.data ?? [])[0] as { conducted_at: string; next_review_at: string | null } | undefined);
  return {
    hasPlan: objectives.length > 0,
    objectives,
    headlineKpis,
    nextReviewAt: latest?.next_review_at ?? null,
    lastReviewAt: latest?.conducted_at ?? null,
  };
});

// ── Priorities: dated tasks + grant requirement deadlines ────────────────────

export type PriorityRow = { key: string; title: string; sub: string; due: string; href: string };

const GRANT_KIND_LABELS: Record<string, string> = {
  loi: "LOI",
  application: "Application",
  interim_report: "Interim report",
  final_report: "Final report",
  financial_report: "Financial report",
  other: "Deadline",
};

export const getPriorities = cache(async (): Promise<{ rows: PriorityRow[]; openTaskCount: number }> => {
  const ctx = await getOrgContext();
  if (!ctx) return { rows: [], openTaskCount: 0 };
  const sb = getSupabaseAdmin();
  const [tasksRes, openTasksRes, grantReqsRes] = await Promise.all([
    sb
      .from("ops_tasks")
      .select("id, title, category, due_date")
      .eq("org_id", ctx.orgId)
      .neq("status", "done")
      .is("archived_at", null)
      .not("due_date", "is", null)
      .order("due_date", { ascending: true })
      .limit(8),
    sb.from("ops_tasks").select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId).neq("status", "done").is("archived_at", null),
    sb
      .from("grant_requirements")
      .select("id, grant_id, kind, label, due_date, grants(name)")
      .eq("org_id", ctx.orgId)
      .in("status", ["upcoming", "in_progress"])
      .order("due_date", { ascending: true })
      .limit(8),
  ]);

  const grantRows = (grantReqsRes.error ? [] : grantReqsRes.data ?? []) as unknown as Array<{
    id: string;
    grant_id: string;
    kind: string;
    label: string | null;
    due_date: string;
    grants: { name: string } | null;
  }>;

  const rows: PriorityRow[] = [
    ...(tasksRes.data ?? []).map((t) => ({
      key: `task-${t.id}`,
      title: t.title as string,
      sub: (t.category as string) ?? "task",
      due: t.due_date as string,
      href: "/admin/ops",
    })),
    ...grantRows.map((r) => ({
      key: `grant-${r.id}`,
      title: r.label || GRANT_KIND_LABELS[r.kind] || "Grant deadline",
      sub: r.grants?.name ? `grant · ${r.grants.name}` : "grant",
      due: r.due_date,
      href: `/admin/fundraising/grants/${r.grant_id}`,
    })),
  ]
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
    .slice(0, 6);

  return { rows, openTaskCount: openTasksRes.count ?? 0 };
});

// ── Pipeline (HubSpot deals, by stage) ───────────────────────────────────────

export type PipelineData = {
  stages: Array<{ stage: string; count: number; total: number }>;
  total: number;
};

const humanizeStage = (s: string) => s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const getPipeline = cache(async (): Promise<PipelineData> => {
  const ctx = await getOrgContext();
  if (!ctx) return { stages: [], total: 0 };
  const sb = getSupabaseAdmin();
  const res = await sb.from("hs_deals").select("stage, amount").eq("org_id", ctx.orgId).limit(1000);
  const agg = new Map<string, { count: number; total: number }>();
  for (const d of res.data ?? []) {
    if (!d.stage) continue;
    const cur = agg.get(d.stage) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(d.amount ?? 0);
    agg.set(d.stage, cur);
  }
  const stages = Array.from(agg.entries())
    .map(([stage, v]) => ({ stage: humanizeStage(stage), ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const total = Array.from(agg.values()).reduce((s, v) => s + v.total, 0);
  return { stages, total };
});

// ── Fundraising spine helpers (user-session client + explicit active-org
// filter — RLS alone spans all the user's orgs) ──────────────────────────────


const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

type ConstituentLite = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
} | null;

const profileHref = (c: ConstituentLite) => (c ? `/admin/fundraising/donors/${c.id}` : "/admin/fundraising");

// ── Goal + forecast ──────────────────────────────────────────────────────────

export type ForecastData = {
  raised: number;
  committedSteward: number;
  committed: number;
  weightedOpen: number;
  forecast: number;
  goal: number;
  gap: number;
  /** Open-stage asks counted into weightedOpen (Reed narrates this). */
  openAskCount: number;
};

/**
 * Forecast = committed (gifts raised this FY + stewardship-stage asks) +
 * weighted open (Σ ask_amount × probability across identify/qualify/cultivate/
 * solicit, probability defaulting to 50% when blank). Closed-lost is excluded.
 * This is deliberately NOT total pipeline — that's the vanity number the cockpit
 * is built to avoid.
 */
export const getForecast = cache(async (): Promise<ForecastData> => {
  const ctx = await getOrgContext();
  if (!ctx)
    return { raised: 0, committedSteward: 0, committed: 0, weightedOpen: 0, forecast: 0, goal: 0, gap: 0, openAskCount: 0 };
  const sb = createServerSupabase();
  const fin = await getFinance();
  const fy = fiscalYearBounds(fin.cfg.year, fin.cfg.startMonth);

  const [giftsRes, oppsRes] = await Promise.all([
    sb.from("gifts").select("amount").eq("org_id", ctx.orgId).gte("gift_date", fy.start).lte("gift_date", fy.end),
    sb
      .from("opportunities")
      .select("stage, ask_amount, probability")
      .eq("org_id", ctx.orgId)
      .neq("stage", "lost")
      .or(EXCLUDE_PARTNERSHIP_OPPS),
  ]);

  const raised = (giftsRes.data ?? []).reduce((s, g) => s + Number(g.amount), 0);

  let weightedOpen = 0;
  let committedSteward = 0;
  let openAskCount = 0;
  for (const o of oppsRes.data ?? []) {
    const ask = Number(o.ask_amount ?? 0);
    if (isWonStage(o.stage as string)) {
      committedSteward += ask;
    } else if (OPEN_STAGE_LIST.includes(o.stage as string)) {
      openAskCount += 1;
      const p = o.probability == null ? 50 : Number(o.probability);
      weightedOpen += ask * (p / 100);
    }
  }

  const committed = raised + committedSteward;
  const forecast = committed + weightedOpen;
  const goal = fin.cfg.goal;
  return { raised, committedSteward, committed, weightedOpen, forecast, goal, gap: goal - forecast, openAskCount };
});

// ── Moves only you can make ──────────────────────────────────────────────────

export type MoveRow = {
  id: string;
  name: string;
  stage: string;
  askAmount: number | null;
  owner: string | null;
  nextStep: string | null;
  nextStepDue: string | null;
  reason: "missing" | "overdue";
  href: string;
};

/**
 * Open asks where the owner is the VIEWER or ask_amount ≥ $10k, AND the next
 * step is missing or overdue. Biggest ask first — the moves only the
 * signed-in principal can make.
 */
export const getMoves = cache(async (): Promise<MoveRow[]> => {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  const sb = createServerSupabase();
  const today = todayISO();
  // Viewer's first-name handle; assigneeSlug strips PostgREST filter syntax,
  // so interpolating it into .or() below is safe.
  const me = await getAdminUser();
  const ownerArm = me ? `owner.ilike.${me},` : "";

  const res = await sb
    .from("opportunities")
    .select(
      "id, name, stage, ask_amount, owner, next_step, next_step_due, " +
        "constituent:constituents ( id, type, first_name, last_name, org_name )",
    )
    .eq("org_id", ctx.orgId)
    .in("stage", OPEN_STAGE_LIST)
    .or(EXCLUDE_PARTNERSHIP_OPPS)
    .or(`${ownerArm}ask_amount.gte.10000`)
    .order("ask_amount", { ascending: false, nullsFirst: false })
    .limit(100);

  const rows = (res.data ?? []) as unknown as Array<{
    id: string;
    name: string | null;
    stage: string;
    ask_amount: number | null;
    owner: string | null;
    next_step: string | null;
    next_step_due: string | null;
    constituent: ConstituentLite;
  }>;

  return rows
    .map((o) => {
      const missing = o.next_step == null;
      const overdue = o.next_step_due != null && o.next_step_due < today;
      if (!missing && !overdue) return null;
      return {
        id: o.id,
        name: o.name ?? (o.constituent ? constituentName(o.constituent) : "Untitled ask"),
        stage: o.stage,
        askAmount: o.ask_amount == null ? null : Number(o.ask_amount),
        owner: o.owner,
        nextStep: o.next_step,
        nextStepDue: o.next_step_due,
        reason: missing ? ("missing" as const) : ("overdue" as const),
        href: profileHref(o.constituent),
      };
    })
    .filter((r): r is MoveRow => r !== null);
});

// ── Fires ────────────────────────────────────────────────────────────────────

export type FireItem = {
  id: string;
  severity: "critical" | "watch";
  title: string;
  detail: string;
  href: string;
};

const GRANT_KIND_SHORT: Record<string, string> = {
  loi: "LOI",
  application: "Application",
  interim_report: "Interim report",
  final_report: "Final report",
  financial_report: "Financial report",
  other: "Requirement",
};

/**
 * Decisions only the CEO makes, each linking straight to the thing to act on:
 *  - a major-gift prospect (open ask ≥ $10k) cold for 60+ days,
 *  - a grant requirement due within 14 days,
 *  - runway under 2 months,
 *  - a top ask with an overdue next step.
 * Hygiene/data items deliberately do NOT live here — those are Shannon's.
 */
export const getFires = cache(async (): Promise<FireItem[]> => {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  const sb = createServerSupabase();
  const fin = await getFinance();
  const today = todayISO();
  const in14 = addDays(today, 14);
  const since60 = addDays(today, -60);

  const items: FireItem[] = [];

  if (fin.runwayMonths != null && fin.runwayMonths < 2) {
    items.push({
      id: "fire:runway",
      severity: "critical",
      title: "Runway under 2 months",
      detail: `${fin.runwayMonths.toFixed(1)} months left at the current burn — raise or cut now.`,
      href: "/admin/finance",
    });
  }

  const [grantsRes, overdueRes, majorRes] = await Promise.all([
    sb
      .from("grant_requirements")
      .select("id, grant_id, kind, label, due_date, grants(name)")
      .eq("org_id", ctx.orgId)
      .in("status", ["upcoming", "in_progress"])
      .gte("due_date", today)
      .lte("due_date", in14)
      .order("due_date", { ascending: true })
      .limit(10),
    sb
      .from("opportunities")
      .select("id, name, ask_amount, next_step_due, constituent:constituents ( id, type, first_name, last_name, org_name )")
      .eq("org_id", ctx.orgId)
      .in("stage", OPEN_STAGE_LIST)
      .or(EXCLUDE_PARTNERSHIP_OPPS)
      .not("next_step_due", "is", null)
      .lt("next_step_due", today)
      .order("ask_amount", { ascending: false, nullsFirst: false })
      .limit(3),
    sb
      .from("opportunities")
      .select("ask_amount, constituent:constituents ( id, type, first_name, last_name, org_name )")
      .eq("org_id", ctx.orgId)
      .in("stage", OPEN_STAGE_LIST)
      .or(EXCLUDE_PARTNERSHIP_OPPS)
      .gte("ask_amount", 10000)
      .limit(100),
  ]);

  const grantRows = (grantsRes.error ? [] : grantsRes.data ?? []) as unknown as Array<{
    id: string;
    grant_id: string;
    kind: string;
    label: string | null;
    due_date: string;
    grants: { name: string } | null;
  }>;
  for (const r of grantRows) {
    const days = Math.round((new Date(r.due_date + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000);
    items.push({
      id: `fire:grant:${r.id}`,
      severity: days <= 3 ? "critical" : "watch",
      title: `${r.label || GRANT_KIND_SHORT[r.kind] || "Grant requirement"} due in ${days}d`,
      detail: r.grants?.name ? `Grant · ${r.grants.name}` : "Grant requirement",
      href: `/admin/fundraising/grants/${r.grant_id}`,
    });
  }

  const overdueRows = (overdueRes.data ?? []) as unknown as Array<{
    id: string;
    name: string | null;
    ask_amount: number | null;
    next_step_due: string;
    constituent: ConstituentLite;
  }>;
  for (const o of overdueRows) {
    const who = o.name ?? (o.constituent ? constituentName(o.constituent) : "Untitled ask");
    const amt = o.ask_amount == null ? "" : ` (${formatUsd(Number(o.ask_amount))})`;
    items.push({
      id: `fire:overdue:${o.id}`,
      severity: "critical",
      title: `Top ask overdue: ${who}${amt}`,
      detail: `Next step was due ${o.next_step_due}.`,
      href: profileHref(o.constituent),
    });
  }

  // Major-gift prospects cold for 60+ days: of the open ≥$10k prospects, which
  // have had no interaction logged in the last 60 days.
  const majorRows = (majorRes.data ?? []) as unknown as Array<{ ask_amount: number | null; constituent: ConstituentLite }>;
  const byId = new Map<string, ConstituentLite>();
  for (const m of majorRows) if (m.constituent) byId.set(m.constituent.id, m.constituent);
  const ids = Array.from(byId.keys());
  if (ids.length > 0) {
    const warmRes = await sb
      .from("interactions")
      .select("constituent_id")
      .eq("org_id", ctx.orgId)
      .in("constituent_id", ids)
      .gte("occurred_at", since60 + "T00:00:00");
    const warm = new Set((warmRes.data ?? []).map((r) => r.constituent_id as string));
    const cold = ids.filter((id) => !warm.has(id)).slice(0, 5);
    for (const id of cold) {
      const c = byId.get(id) ?? null;
      items.push({
        id: `fire:cold:${id}`,
        severity: "watch",
        title: `Major prospect cold: ${c ? constituentName(c) : "Unknown"}`,
        detail: "No contact logged in 60+ days.",
        href: profileHref(c),
      });
    }
  }

  // Criticals first, then capped — fires are a short list, not a feed.
  return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1)).slice(0, 8);
});

// Local USD formatter (sources stay free of the chart module's client code).
function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// ════════════════════════════════════════════════════════════════════════════
// Ops control panel (Shannon) sources
// ════════════════════════════════════════════════════════════════════════════

// ── My queue: Shannon's open tasks, prioritized ──────────────────────────────

export type QueueTask = {
  id: string;
  title: string;
  category: string | null;
  due: string | null;
  pinnedToday: boolean;
  priority: TaskPriority;
  /** Detail link for non-ops rows (compliance items); ops tasks use the widget default. */
  href?: string;
};

type QueueRow = QueueTask & { updatedAt: string };

/**
 * Tiered urgency bucket for the queue (lower = higher in the list). The cockpit
 * leads with what's due, then what's urgent, so an undated `urgent` task beats
 * dated busywork instead of sinking to a "No date" row:
 *   0 overdue · 1 due today (or pinned for today) · 2 urgent · 3 everything else
 */
function queueTier(t: QueueRow, today: string): number {
  if (t.due != null && t.due < today) return 0;
  if (t.due === today || t.pinnedToday) return 1;
  if (t.priority === "urgent") return 2;
  return 3;
}

/**
 * Full queue comparator: tier first, then the within-tier rule —
 *  - tier 0 (overdue): oldest due first
 *  - everything else: soonest due (nulls last) → priorityRank → updated_at
 */
function compareQueue(a: QueueRow, b: QueueRow, today: string): number {
  const ta = queueTier(a, today);
  const tb = queueTier(b, today);
  if (ta !== tb) return ta - tb;

  // Overdue: oldest first (ascending due date — both are non-null here).
  if (ta === 0) return a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : 0;

  // Soonest due, nulls last.
  if (a.due !== b.due) {
    if (a.due == null) return 1;
    if (b.due == null) return -1;
    return a.due < b.due ? -1 : 1;
  }
  const pr = priorityRank(a.priority) - priorityRank(b.priority);
  if (pr !== 0) return pr;
  return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
}

export const getQueueTasks = cache(async (): Promise<{ tasks: QueueTask[]; total: number }> => {
  // Scope to the signed-in person and their active org: each user sees only
  // their OWN to-dos. Matches on the uuid owner column (ops_tasks.assigned_to_id
  // / compliance_items.assigned_to_id — owner_uuid_promotion.sql), which the DB
  // keeps in sync with the legacy text assignee. The prior hardcoded "remi"
  // string match showed one person's list to everyone (and every org).
  const ctx = await getOrgContext();
  if (!ctx) return { tasks: [], total: 0 };
  const sb = getSupabaseAdmin();
  const today = todayISO();
  const [res, countRes, complianceRes] = await Promise.all([
    sb
      .from("ops_tasks")
      .select("id, title, category, due_date, pinned_for_today, priority, updated_at")
      .eq("org_id", ctx.orgId)
      .eq("assigned_to_id", ctx.userId)
      .neq("status", "done")
      .is("archived_at", null)
      // Fetch a wider window than we display: the JS comparator can promote an
      // undated urgent task above dated rows, so slicing must happen post-sort.
      .limit(40),
    sb
      .from("ops_tasks")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("assigned_to_id", ctx.userId)
      .neq("status", "done")
      .is("archived_at", null),
    // Compliance items assigned to this person surface here once their due
    // date is ≤30 days out (see lib/admin/overview/complianceQueue.ts).
    sb
      .from("compliance_items")
      .select("id, title, assigned_to, status, due_date, updated_at")
      .eq("org_id", ctx.orgId)
      .eq("assigned_to_id", ctx.userId)
      .in("status", [...OPEN_COMPLIANCE_STATUSES])
      .lte("due_date", complianceQueueHorizon(today))
      .limit(20),
  ]);
  const complianceRows: QueueRow[] = ((complianceRes.data ?? []) as ComplianceQueueSource[]).map(
    complianceQueueEntry
  );
  const rows: QueueRow[] = (res.data ?? [])
    .map((t) => ({
      id: t.id as string,
      title: t.title as string,
      category: (t.category as string | null) ?? null,
      due: (t.due_date as string | null) ?? null,
      pinnedToday: Boolean(t.pinned_for_today),
      priority: (t.priority as TaskPriority) ?? "medium",
      updatedAt: (t.updated_at as string | null) ?? "",
    }))
    .concat(complianceRows);
  rows.sort((a, b) => compareQueue(a, b, today));
  const tasks: QueueTask[] = rows.slice(0, 12).map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    due: t.due,
    pinnedToday: t.pinnedToday,
    priority: t.priority,
    href: t.href,
  }));
  return { tasks, total: (countRes.count ?? 0) + complianceRows.length };
});

// ── Acknowledgments due: pending thank-yous, oldest first, IRS-flagged ────────

export type AckRow = {
  id: string;
  donor: string;
  amount: number;
  giftDate: string;
  irs: boolean;
  href: string;
};

export const getAcksDue = cache(async (): Promise<{ rows: AckRow[]; total: number; totalValue: number }> => {
  const ctx = await getOrgContext();
  if (!ctx) return { rows: [], total: 0, totalValue: 0 };
  const sb = createServerSupabase();
  const res = await sb
    .from("gifts")
    .select("id, amount, gift_date, constituent:constituents ( id, type, first_name, last_name, org_name )")
    .eq("org_id", ctx.orgId)
    .eq("acknowledgment_status", "pending")
    .order("gift_date", { ascending: true })
    .limit(50);

  const rows = (res.data ?? []) as unknown as Array<{
    id: string;
    amount: number;
    gift_date: string;
    constituent: ConstituentLite;
  }>;

  const mapped: AckRow[] = rows.map((g) => ({
    id: g.id,
    donor: g.constituent ? constituentName(g.constituent) : "Anonymous",
    amount: Number(g.amount),
    giftDate: g.gift_date,
    irs: Number(g.amount) >= 250,
    href: g.constituent ? profileHref(g.constituent) : "/admin/fundraising/acknowledgments",
  }));

  return { rows: mapped, total: mapped.length, totalValue: mapped.reduce((s, r) => s + r.amount, 0) };
});

// ── Scheduling lane: upcoming confirmed bookings ─────────────────────────────

export type BookingRow = { id: string; name: string; type: string; start: string };

export const getSchedulingLane = cache(async (): Promise<BookingRow[]> => {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  const sb = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const res = await sb
    .from("bookings")
    .select("id, attendee_name, start_time, meeting_types(name)")
    .eq("org_id", ctx.orgId)
    .eq("status", "confirmed")
    .gte("start_time", nowIso)
    .order("start_time", { ascending: true })
    .limit(8);
  const rows = (res.data ?? []) as unknown as Array<{
    id: string;
    attendee_name: string;
    start_time: string;
    meeting_types: { name: string } | null;
  }>;
  return rows.map((b) => ({
    id: b.id,
    name: b.attendee_name,
    type: b.meeting_types?.name ?? "Meeting",
    start: b.start_time,
  }));
});

// ── Schedule: upcoming meetings from the connected Google Calendar ────────────

export type ScheduleItem = { id: string; title: string; start: string; allDay: boolean; sub: string | null };

/**
 * Upcoming events on the connected Google Calendar (GOOGLE_CALENDAR_ID) for the
 * next two weeks. Because the /meet scheduler writes its bookings to that same
 * calendar, this is the unified "what's on my calendar" view. If Calendar isn't
 * configured/reachable, it degrades to the /meet bookings table so the widget
 * still shows something honest. `source` lets the widget say which it's showing.
 */
export const getSchedule = cache(async (): Promise<{ items: ScheduleItem[]; source: "calendar" | "bookings"; timeZone: string }> => {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86400000);

  try {
    const { listUpcomingEvents } = await import("@/lib/google/calendar");
    const { events, timeZone } = await listUpcomingEvents(now, horizon, 12);
    return {
      items: events.map((e) => ({ id: e.id, title: e.title, start: e.start, allDay: e.allDay, sub: e.location })),
      source: "calendar",
      timeZone,
    };
  } catch {
    // Calendar env missing or API error — fall back to the bookings spine.
    const ctx = await getOrgContext();
    if (!ctx) return { items: [], source: "bookings", timeZone: "America/Los_Angeles" };
    const sb = getSupabaseAdmin();
    const res = await sb
      .from("bookings")
      .select("id, attendee_name, start_time, meeting_types(name)")
      .eq("org_id", ctx.orgId)
      .eq("status", "confirmed")
      .gte("start_time", now.toISOString())
      .lte("start_time", horizon.toISOString())
      .order("start_time", { ascending: true })
      .limit(12);
    const rows = (res.data ?? []) as unknown as Array<{
      id: string;
      attendee_name: string;
      start_time: string;
      meeting_types: { name: string } | null;
    }>;
    return {
      items: rows.map((b) => ({
        id: b.id,
        title: b.attendee_name,
        start: b.start_time,
        allDay: false,
        sub: b.meeting_types?.name ?? "Meeting",
      })),
      source: "bookings",
      timeZone: "America/Los_Angeles",
    };
  }
});

// ── Data hygiene: the stale-data alert lives HERE (it's Shannon's, actionable) ─

export type HygieneData = {
  sync: { source: string; label: string; severity: "fresh" | "watch" | "stale" | "untracked" }[];
  unattributedGifts: number;
  staleHubspot: boolean;
};

export const getDataHygiene = cache(async (): Promise<HygieneData> => {
  const ctx = await getOrgContext();
  const sb = createServerSupabase();
  const [age, unattrib] = await Promise.all([
    ctx
      ? getDataAge(ctx.orgId)
      : Promise.resolve({ ageLabel: "never", severity: "stale" as const }),
    ctx
      ? sb.from("gifts").select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId).is("constituent_id", null)
      : Promise.resolve({ count: 0 }),
  ]);
  return {
    sync: [
      { source: "HubSpot", label: age.ageLabel === "never" ? "never synced" : `${age.ageLabel} ago`, severity: age.severity },
      // Gmail / Stripe don't have first-class sync-status tracking yet (Phase 0
      // gap) — shown honestly as untracked rather than faking freshness.
      { source: "Gmail", label: "not tracked", severity: "untracked" },
      { source: "Stripe", label: "not tracked", severity: "untracked" },
    ],
    unattributedGifts: unattrib.count ?? 0,
    staleHubspot: age.severity === "stale",
  };
});

// ── Deadlines + finance ops: grant requirements + overdue pledge installments ─

export type DeadlineRow = { id: string; title: string; sub: string; due: string; href: string; overdue: boolean };

export const getDeadlinesFinance = cache(async (): Promise<DeadlineRow[]> => {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  const sb = createServerSupabase();
  const today = todayISO();
  const in30 = addDays(today, 30);

  const [grantsRes, pledgesRes] = await Promise.all([
    sb
      .from("grant_requirements")
      .select("id, grant_id, kind, label, due_date, grants(name)")
      .eq("org_id", ctx.orgId)
      .in("status", ["upcoming", "in_progress"])
      .lte("due_date", in30)
      .order("due_date", { ascending: true })
      .limit(12),
    sb
      .from("pledge_payments")
      .select("id, pledge_id, due_date, expected_amount")
      .eq("org_id", ctx.orgId)
      .eq("status", "scheduled")
      .lt("due_date", today)
      .order("due_date", { ascending: true })
      .limit(12),
  ]);

  const grantRows = (grantsRes.error ? [] : grantsRes.data ?? []) as unknown as Array<{
    id: string;
    grant_id: string;
    kind: string;
    label: string | null;
    due_date: string;
    grants: { name: string } | null;
  }>;
  const pledgeRows = (pledgesRes.error ? [] : pledgesRes.data ?? []) as unknown as Array<{
    id: string;
    pledge_id: string;
    due_date: string;
    expected_amount: number;
  }>;

  const rows: DeadlineRow[] = [
    ...grantRows.map((r) => ({
      id: `grant-${r.id}`,
      title: r.label || GRANT_KIND_SHORT[r.kind] || "Grant requirement",
      sub: r.grants?.name ? `grant · ${r.grants.name}` : "grant",
      due: r.due_date,
      href: `/admin/fundraising/grants/${r.grant_id}`,
      overdue: r.due_date < today,
    })),
    ...pledgeRows.map((p) => ({
      id: `pledge-${p.id}`,
      title: `Pledge installment ${formatUsd(Number(p.expected_amount))}`,
      sub: "overdue installment",
      due: p.due_date,
      href: `/admin/fundraising/pledges/${p.pledge_id}`,
      overdue: true,
    })),
  ]
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
    .slice(0, 8);

  return rows;
});

// ── Fundraising follow-through: overdue moves, ownerless asks, recent gifts ───

export type FollowThrough = {
  overdueMoves: number;
  ownerlessAsks: number;
  recentGifts: number;
  recentGiftsValue: number;
};

export const getFollowThrough = cache(async (): Promise<FollowThrough> => {
  const ctx = await getOrgContext();
  if (!ctx) return { overdueMoves: 0, ownerlessAsks: 0, recentGifts: 0, recentGiftsValue: 0 };
  const sb = createServerSupabase();
  const today = todayISO();
  const since14 = addDays(today, -14);

  const [overdueRes, ownerlessRes, recentRes] = await Promise.all([
    sb
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .in("stage", OPEN_STAGE_LIST)
      .or(EXCLUDE_PARTNERSHIP_OPPS)
      .not("next_step_due", "is", null)
      .lt("next_step_due", today),
    sb
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .in("stage", OPEN_STAGE_LIST)
      .or(EXCLUDE_PARTNERSHIP_OPPS)
      .is("owner", null),
    sb.from("gifts").select("amount").eq("org_id", ctx.orgId).gte("gift_date", since14),
  ]);

  const recent = recentRes.data ?? [];
  return {
    overdueMoves: overdueRes.count ?? 0,
    ownerlessAsks: ownerlessRes.count ?? 0,
    recentGifts: recent.length,
    recentGiftsValue: recent.reduce((s, g) => s + Number(g.amount), 0),
  };
});
