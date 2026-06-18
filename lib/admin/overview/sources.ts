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
 * interactions) is read under the user-session client (RLS, org-scoped) — the
 * same path the rest of the fundraising module already uses. Finance and the
 * legacy donations/ops/analytics reads carried over from the old Command
 * Center stay on the service-role client until those modules' RLS conversion
 * lands; switching them here would be a behavior change outside this spec.
 */
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { constituentName } from "@/lib/fundraising/display";
import { todayISO } from "@/app/admin/ops/_types/ops";
import { getDataAge } from "@/lib/admin/dataAge";

// ── Fiscal-year + month helpers (shared with lib/admin/finance.ts) ───────────

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fiscalYearBounds = (year: number, startMonth: number) => {
  if (startMonth === 1) return { start: `${year}-01-01`, end: `${year}-12-31` };
  const sm = String(startMonth).padStart(2, "0");
  const lastDay = new Date(year, startMonth - 1, 0).getDate();
  const em = String(startMonth - 1).padStart(2, "0");
  return { start: `${year - 1}-${sm}-01`, end: `${year}-${em}-${lastDay}` };
};

const monthLabel = (yyyymm: string) => MONTH_ABBR[Number(yyyymm.slice(5, 7)) - 1] ?? "";

function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, 1));
  const e = new Date(end + "T00:00:00Z");
  while (cur <= e) {
    out.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

// ── Finance ──────────────────────────────────────────────────────────────────

export type MonthBucket = { label: string; revenue: number; expense: number; ending: number };

export type FinanceData = {
  cfg: { year: number; startMonth: number; goal: number; startBal: number; startDate: string | null };
  revenueYTD: number;
  expenseYTD: number;
  cashOnHand: number;
  /** Trailing 3-active-month average monthly expense. */
  burn3mo: number;
  /** cashOnHand / burn3mo; null when there is no burn to divide by. */
  runwayMonths: number | null;
  monthBuckets: MonthBucket[];
};

/**
 * Cash, burn, runway and the monthly revenue/expense/ending series — the spine
 * for the runway hero, the finance chart and the runway "fire". Runway = cash
 * on hand / trailing-3-month average burn, matching lib/admin/finance.ts.
 */
export const getFinance = cache(async (): Promise<FinanceData> => {
  const sb = getSupabaseAdmin();
  const now = new Date();

  const cfgRes = await sb
    .from("fin_config")
    .select("current_year, fiscal_year_start_month, fundraising_goal, cash_starting_balance, cash_starting_date")
    .eq("id", 1)
    .maybeSingle();
  const cfg = {
    year: typeof cfgRes.data?.current_year === "number" ? cfgRes.data.current_year : now.getFullYear(),
    startMonth: typeof cfgRes.data?.fiscal_year_start_month === "number" ? cfgRes.data.fiscal_year_start_month : 1,
    goal: Number(cfgRes.data?.fundraising_goal ?? 0),
    startBal: Number(cfgRes.data?.cash_starting_balance ?? 0),
    startDate: (cfgRes.data?.cash_starting_date as string | null) ?? null,
  };
  const fy = fiscalYearBounds(cfg.year, cfg.startMonth);

  const [txnsRes, cashRes] = await Promise.all([
    sb.from("fin_transactions").select("txn_date, amount").gte("txn_date", fy.start).lte("txn_date", fy.end),
    cfg.startDate
      ? sb.from("fin_transactions").select("amount").gt("txn_date", cfg.startDate)
      : Promise.resolve({ data: [] as Array<{ amount: number }>, error: null }),
  ]);

  const txns = (txnsRes.data ?? []).map((t) => ({ txn_date: t.txn_date as string, amount: Number(t.amount) }));
  const revenueYTD = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenseYTD = txns.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const cashOnHand = cfg.startBal + (cashRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);

  const monthMap = new Map<string, { revenue: number; expense: number }>();
  monthsBetween(fy.start, fy.end).forEach((m) => monthMap.set(m, { revenue: 0, expense: 0 }));
  for (const t of txns) {
    const b = monthMap.get(t.txn_date.slice(0, 7));
    if (!b) continue;
    if (t.amount > 0) b.revenue += t.amount;
    else b.expense -= t.amount;
  }
  let running = cfg.startBal;
  const monthBuckets: MonthBucket[] = Array.from(monthMap.entries()).map(([m, b]) => {
    running += b.revenue - b.expense;
    return { label: monthLabel(m), revenue: b.revenue, expense: b.expense, ending: running };
  });
  const active = monthBuckets.filter((b) => b.revenue > 0 || b.expense > 0);
  const last3 = active.slice(-3);
  const burn3mo = last3.reduce((s, b) => s + b.expense, 0) / Math.max(last3.length, 1);
  const runwayMonths = burn3mo > 0 ? cashOnHand / burn3mo : null;

  return { cfg, revenueYTD, expenseYTD, cashOnHand, burn3mo, runwayMonths, monthBuckets };
});

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
  const sb = getSupabaseAdmin();
  const [tasksRes, openTasksRes, grantReqsRes] = await Promise.all([
    sb
      .from("ops_tasks")
      .select("id, title, category, due_date")
      .neq("status", "done")
      .not("due_date", "is", null)
      .order("due_date", { ascending: true })
      .limit(8),
    sb.from("ops_tasks").select("id", { count: "exact", head: true }).neq("status", "done"),
    sb
      .from("grant_requirements")
      .select("id, grant_id, kind, label, due_date, grants(name)")
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
  const sb = getSupabaseAdmin();
  const res = await sb.from("hs_deals").select("stage, amount").limit(1000);
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

// ── Fundraising spine helpers (user-session client, RLS, org-scoped) ──────────

const OPEN_STAGES = ["identify", "qualify", "cultivate", "solicit"];

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
};

/**
 * Forecast = committed (gifts raised this FY + stewardship-stage asks) +
 * weighted open (Σ ask_amount × probability across identify/qualify/cultivate/
 * solicit, probability defaulting to 50% when blank). Closed-lost is excluded.
 * This is deliberately NOT total pipeline — that's the vanity number the cockpit
 * is built to avoid.
 */
export const getForecast = cache(async (): Promise<ForecastData> => {
  const sb = createServerSupabase();
  const fin = await getFinance();
  const fy = fiscalYearBounds(fin.cfg.year, fin.cfg.startMonth);

  const [giftsRes, oppsRes] = await Promise.all([
    sb.from("gifts").select("amount").gte("gift_date", fy.start).lte("gift_date", fy.end),
    sb.from("opportunities").select("stage, ask_amount, probability").neq("stage", "lost"),
  ]);

  const raised = (giftsRes.data ?? []).reduce((s, g) => s + Number(g.amount), 0);

  let weightedOpen = 0;
  let committedSteward = 0;
  for (const o of oppsRes.data ?? []) {
    const ask = Number(o.ask_amount ?? 0);
    if (o.stage === "steward") {
      committedSteward += ask;
    } else if (OPEN_STAGES.includes(o.stage as string)) {
      const p = o.probability == null ? 50 : Number(o.probability);
      weightedOpen += ask * (p / 100);
    }
  }

  const committed = raised + committedSteward;
  const forecast = committed + weightedOpen;
  const goal = fin.cfg.goal;
  return { raised, committedSteward, committed, weightedOpen, forecast, goal, gap: goal - forecast };
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
 * Open asks where the owner is Remi OR ask_amount ≥ $10k, AND the next step is
 * missing or overdue. Biggest ask first — the moves only the CEO can make.
 */
export const getMoves = cache(async (): Promise<MoveRow[]> => {
  const sb = createServerSupabase();
  const today = todayISO();

  const res = await sb
    .from("opportunities")
    .select(
      "id, name, stage, ask_amount, owner, next_step, next_step_due, " +
        "constituent:constituents ( id, type, first_name, last_name, org_name )",
    )
    .in("stage", OPEN_STAGES)
    .or("owner.ilike.remi,ask_amount.gte.10000")
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
      .in("status", ["upcoming", "in_progress"])
      .gte("due_date", today)
      .lte("due_date", in14)
      .order("due_date", { ascending: true })
      .limit(10),
    sb
      .from("opportunities")
      .select("id, name, ask_amount, next_step_due, constituent:constituents ( id, type, first_name, last_name, org_name )")
      .in("stage", OPEN_STAGES)
      .not("next_step_due", "is", null)
      .lt("next_step_due", today)
      .order("ask_amount", { ascending: false, nullsFirst: false })
      .limit(3),
    sb
      .from("opportunities")
      .select("ask_amount, constituent:constituents ( id, type, first_name, last_name, org_name )")
      .in("stage", OPEN_STAGES)
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
};

export const getMyQueue = cache(async (): Promise<{ tasks: QueueTask[]; total: number }> => {
  const sb = getSupabaseAdmin();
  const [res, countRes] = await Promise.all([
    sb
      .from("ops_tasks")
      .select("id, title, category, due_date, pinned_for_today")
      .eq("assigned_to", "shannon")
      .neq("status", "done")
      .order("pinned_for_today", { ascending: false })
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(12),
    sb.from("ops_tasks").select("id", { count: "exact", head: true }).eq("assigned_to", "shannon").neq("status", "done"),
  ]);
  const tasks = (res.data ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    category: (t.category as string | null) ?? null,
    due: (t.due_date as string | null) ?? null,
    pinnedToday: Boolean(t.pinned_for_today),
  }));
  return { tasks, total: countRes.count ?? 0 };
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
  const sb = createServerSupabase();
  const res = await sb
    .from("gifts")
    .select("id, amount, gift_date, constituent:constituents ( id, type, first_name, last_name, org_name )")
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
  const sb = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const res = await sb
    .from("bookings")
    .select("id, attendee_name, start_time, meeting_types(name)")
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

// ── Data hygiene: the stale-data alert lives HERE (it's Shannon's, actionable) ─

export type HygieneData = {
  sync: { source: string; label: string; severity: "fresh" | "watch" | "stale" | "untracked" }[];
  unattributedGifts: number;
  staleHubspot: boolean;
};

export const getDataHygiene = cache(async (): Promise<HygieneData> => {
  const sb = createServerSupabase();
  const [age, unattrib] = await Promise.all([
    getDataAge(),
    sb.from("gifts").select("id", { count: "exact", head: true }).is("constituent_id", null),
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
  const sb = createServerSupabase();
  const today = todayISO();
  const in30 = addDays(today, 30);

  const [grantsRes, pledgesRes] = await Promise.all([
    sb
      .from("grant_requirements")
      .select("id, grant_id, kind, label, due_date, grants(name)")
      .in("status", ["upcoming", "in_progress"])
      .lte("due_date", in30)
      .order("due_date", { ascending: true })
      .limit(12),
    sb
      .from("pledge_payments")
      .select("id, pledge_id, due_date, expected_amount")
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
  const sb = createServerSupabase();
  const today = todayISO();
  const since14 = addDays(today, -14);

  const [overdueRes, ownerlessRes, recentRes] = await Promise.all([
    sb
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .in("stage", OPEN_STAGES)
      .not("next_step_due", "is", null)
      .lt("next_step_due", today),
    sb.from("opportunities").select("id", { count: "exact", head: true }).in("stage", OPEN_STAGES).is("owner", null),
    sb.from("gifts").select("amount").gte("gift_date", since14),
  ]);

  const recent = recentRes.data ?? [];
  return {
    overdueMoves: overdueRes.count ?? 0,
    ownerlessAsks: ownerlessRes.count ?? 0,
    recentGifts: recent.length,
    recentGiftsValue: recent.reduce((s, g) => s + Number(g.amount), 0),
  };
});
