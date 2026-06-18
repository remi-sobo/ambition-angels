/**
 * Canonical finance snapshot — THE single source of truth for cash, burn,
 * runway, the monthly cash-flow series, and YTD totals.
 *
 * Everything that shows these numbers reads from here: the Finance dashboard,
 * the CEO cockpit's finance widget, and the briefing engine. They used to each
 * recompute the same formulas, which risked drift; now there is exactly one
 * implementation.
 *
 * Definitions (locked):
 *   cash on hand = cash_starting_balance + Σ(amount where txn_date > anchor date)
 *   burn         = average expense over the last 3 active months
 *   runway       = cash on hand / burn   (null when there is no burn)
 * The anchor (cash_starting_balance + cash_starting_date) is set on the
 * Finance dashboard / upload hub via "Set current balance" (reconcile), which
 * also stamps cash_reconciled_at so surfaces can show how fresh the figure is.
 */
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Fiscal-year bounds. startMonth is 1..12. startMonth=1 (calendar year) →
 * YYYY-01-01..YYYY-12-31. Non-calendar (e.g. start=7) → Jul of (year-1)..Jun of
 * year, matching how US nonprofits name FY YYYY (the year it ends).
 */
export function fiscalYearBounds(year: number, startMonth: number): { start: string; end: string } {
  if (startMonth === 1) return { start: `${year}-01-01`, end: `${year}-12-31` };
  const sm = String(startMonth).padStart(2, "0");
  const lastDay = new Date(year, startMonth - 1, 0).getDate();
  const em = String(startMonth - 1).padStart(2, "0");
  return { start: `${year - 1}-${sm}-01`, end: `${year}-${em}-${String(lastDay).padStart(2, "0")}` };
}

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

export type MonthBucket = { label: string; revenue: number; expense: number; ending: number };

export type FinanceConfig = {
  year: number;
  startMonth: number;
  goal: number;
  startBal: number;
  startDate: string | null;
  /** ISO timestamp of the last "set current balance" reconcile; null = never. */
  reconciledAt: string | null;
};

export type FinanceSnapshot = {
  cfg: FinanceConfig;
  cashOnHand: number;
  /** Trailing 3-active-month average monthly expense. */
  burn3mo: number;
  /** cash / burn; null when there's no burn to divide by. */
  runwayMonths: number | null;
  monthBuckets: MonthBucket[];
  revenueYTD: number;
  expenseYTD: number;
  netYTD: number;
};

export const getFinanceSnapshot = cache(async (): Promise<FinanceSnapshot> => {
  const sb = getSupabaseAdmin();
  const now = new Date();

  const cfgRes = await sb
    .from("fin_config")
    .select(
      "current_year, fiscal_year_start_month, fundraising_goal, cash_starting_balance, cash_starting_date, cash_reconciled_at"
    )
    .eq("id", 1)
    .maybeSingle();
  const cfg: FinanceConfig = {
    year: typeof cfgRes.data?.current_year === "number" ? cfgRes.data.current_year : now.getFullYear(),
    startMonth: typeof cfgRes.data?.fiscal_year_start_month === "number" ? cfgRes.data.fiscal_year_start_month : 1,
    goal: Number(cfgRes.data?.fundraising_goal ?? 0),
    startBal: Number(cfgRes.data?.cash_starting_balance ?? 0),
    startDate: (cfgRes.data?.cash_starting_date as string | null) ?? null,
    reconciledAt: (cfgRes.data?.cash_reconciled_at as string | null) ?? null,
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
  const burn3mo = last3.length > 0 ? last3.reduce((s, b) => s + b.expense, 0) / last3.length : 0;
  const runwayMonths = burn3mo > 0 ? cashOnHand / burn3mo : null;

  return {
    cfg,
    cashOnHand,
    burn3mo,
    runwayMonths,
    monthBuckets,
    revenueYTD,
    expenseYTD,
    netYTD: revenueYTD - expenseYTD,
  };
});
