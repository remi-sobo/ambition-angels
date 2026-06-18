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
