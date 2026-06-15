/**
 * Finance snapshot for the briefing engine — cash on hand and months of runway,
 * computed the same way the Overview (CommandCenter) does: cash = starting
 * balance + transactions since the starting date; runway = cash / the average
 * monthly burn over the last three active months of the fiscal year.
 *
 * Self-contained (its own copy of the fiscal-year helpers) so wiring the
 * briefing in does not touch the Overview. A later pass can unify the two.
 */

const fiscalYearBounds = (year: number, startMonth: number) => {
  if (startMonth === 1) return { start: `${year}-01-01`, end: `${year}-12-31` };
  const sm = String(startMonth).padStart(2, "0");
  const lastDay = new Date(year, startMonth - 1, 0).getDate();
  const em = String(startMonth - 1).padStart(2, "0");
  return { start: `${year - 1}-${sm}-01`, end: `${year}-${em}-${lastDay}` };
};

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

export type FinanceSnapshot = { cashOnHand: number; runwayMonths: number | null };

export async function getFinanceSnapshot(): Promise<FinanceSnapshot> {
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const sb = getSupabaseAdmin();

  const cfgRes = await sb
    .from("fin_config")
    .select("current_year, fiscal_year_start_month, cash_starting_balance, cash_starting_date")
    .eq("id", 1)
    .maybeSingle();

  const year =
    typeof cfgRes.data?.current_year === "number" ? cfgRes.data.current_year : new Date().getFullYear();
  const startMonth =
    typeof cfgRes.data?.fiscal_year_start_month === "number" ? cfgRes.data.fiscal_year_start_month : 1;
  const startBal = Number(cfgRes.data?.cash_starting_balance ?? 0);
  const startDate = (cfgRes.data?.cash_starting_date as string | null) ?? null;
  const fy = fiscalYearBounds(year, startMonth);

  const [txnsRes, cashRes] = await Promise.all([
    sb.from("fin_transactions").select("txn_date, amount").gte("txn_date", fy.start).lte("txn_date", fy.end),
    startDate
      ? sb.from("fin_transactions").select("amount").gt("txn_date", startDate)
      : sb.from("fin_transactions").select("amount").gte("txn_date", fy.start).lte("txn_date", fy.end),
  ]);

  const txns = (txnsRes.data ?? []).map((t) => ({
    txn_date: t.txn_date as string,
    amount: Number(t.amount),
  }));
  const cashOnHand = startBal + (cashRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);

  const monthMap = new Map<string, { revenue: number; expense: number }>();
  monthsBetween(fy.start, fy.end).forEach((m) => monthMap.set(m, { revenue: 0, expense: 0 }));
  for (const t of txns) {
    const b = monthMap.get(t.txn_date.slice(0, 7));
    if (!b) continue;
    if (t.amount > 0) b.revenue += t.amount;
    else b.expense -= t.amount;
  }
  const active = Array.from(monthMap.values()).filter((b) => b.revenue > 0 || b.expense > 0);
  const last3 = active.slice(-3);
  const burn3mo = last3.reduce((s, b) => s + b.expense, 0) / Math.max(last3.length, 1);
  const runwayMonths = burn3mo > 0 ? cashOnHand / burn3mo : null;

  return { cashOnHand, runwayMonths };
}
