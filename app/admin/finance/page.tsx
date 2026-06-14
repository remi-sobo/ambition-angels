import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FinCategory } from "@/lib/finance/types";
import { loadHubSpotPledges } from "@/lib/finance/hubspot-pledges";
import {
  CashFlowChart,
  CircleGauge,
  Donut,
  ProgressBar,
  Sparkline,
  money,
  type DonutSeg,
  type MonthBucket,
} from "./_components/charts";
import PageHeader from "../_components/PageHeader";

// ── Helpers ────────────────────────────────────────────────────────────────

function fiscalYearBounds(year: number, startMonth: number): { start: string; end: string } {
  // startMonth is 1..12. If startMonth=1 (calendar year), the FY is
  // YYYY-01-01 .. YYYY-12-31. For non-calendar fiscal years (e.g. start=7),
  // FY runs Jul of (year-1) .. Jun of year, matching how most US nonprofits
  // think about FY YYYY (the year it ENDS).
  if (startMonth === 1) {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  const sy = year - 1;
  const sm = String(startMonth).padStart(2, "0");
  const em = String(startMonth - 1).padStart(2, "0");
  return { start: `${sy}-${sm}-01`, end: `${year}-${em}-${endOfMonthDay(year, startMonth - 1)}` };
}

function endOfMonthDay(y: number, m: number): string {
  // Last day of month m (1..12) in year y.
  const d = new Date(y, m, 0).getDate();
  return String(d).padStart(2, "0");
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function monthLabel(yyyymm: string): string {
  const m = Number(yyyymm.slice(5, 7));
  return [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][m - 1] ?? yyyymm.slice(5, 7);
}

function monthsBetween(start: string, end: string): string[] {
  // Inclusive list of YYYY-MM strings.
  const out: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  const cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
  while (cur <= e) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}`);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function FinanceDashboardPage() {
  const supabase = getSupabaseAdmin();

  const { data: cfgRow } = await supabase
    .from("fin_config")
    .select(
      "current_year, fiscal_year_start_month, fundraising_goal, contingency_unlock_threshold, cash_starting_balance, cash_starting_date"
    )
    .eq("id", 1)
    .maybeSingle();
  const cfg = {
    year: typeof cfgRow?.current_year === "number" ? cfgRow.current_year : new Date().getFullYear(),
    startMonth:
      typeof cfgRow?.fiscal_year_start_month === "number" ? cfgRow.fiscal_year_start_month : 1,
    goal: Number(cfgRow?.fundraising_goal ?? 0),
    unlock: Number(cfgRow?.contingency_unlock_threshold ?? 1),
    startBal: Number(cfgRow?.cash_starting_balance ?? 0),
    startDate: cfgRow?.cash_starting_date ?? null,
  };
  const fy = fiscalYearBounds(cfg.year, cfg.startMonth);

  // Pull everything we need in parallel.
  const [
    catsRes,
    txnsRes,
    txnsAllRes,
    budgetRes,
    pledgesRes,
    uncatRes,
    recentRes,
    hubspotPledges,
  ] = await Promise.all([
    supabase
      .from("fin_categories")
      .select("id, group_name, display_name, kind, functional_class, sort_order, enabled")
      .eq("enabled", true)
      .order("sort_order"),
    // Fiscal-year transactions — used for YTD math, monthly buckets, donut.
    supabase
      .from("fin_transactions")
      .select("txn_date, amount, category_id, restricted")
      .gte("txn_date", fy.start)
      .lte("txn_date", fy.end),
    // All transactions after the starting balance anchor — used to compute
    // current cash on hand.
    cfg.startDate
      ? supabase
          .from("fin_transactions")
          .select("amount")
          .gt("txn_date", cfg.startDate)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("fin_budget")
      .select("category_id, base_amount, contingency_t1, contingency_t2, activated_contingency")
      .eq("year", cfg.year),
    supabase
      .from("fin_revenue_commitments")
      .select("source_type, amount, status, probability")
      .eq("year", cfg.year),
    supabase
      .from("fin_transactions")
      .select("id", { count: "exact", head: true })
      .is("category_id", null),
    supabase
      .from("fin_transactions")
      .select("id, txn_date, description, amount, category_id")
      .order("txn_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(10),
    loadHubSpotPledges(supabase, cfg.year),
  ]);

  const categories = (catsRes.data ?? []) as FinCategory[];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const txns =
    (txnsRes.data ?? []) as Array<{
      txn_date: string;
      amount: number;
      category_id: string | null;
      restricted: boolean;
    }>;
  txns.forEach((t) => (t.amount = Number(t.amount)));

  // ── Cash on hand ────────────────────────────────────────────────────────
  // cash = starting_balance + sum(amount > starting_date)
  const txnsSinceStart =
    (txnsAllRes.data ?? []) as Array<{ amount: number }>;
  const sinceStartNet = txnsSinceStart.reduce((s, r) => s + Number(r.amount), 0);
  const cashOnHand = cfg.startBal + sinceStartNet;

  // ── Monthly buckets across the fiscal year ─────────────────────────────
  const months = monthsBetween(fy.start, fy.end);
  const monthMap = new Map<string, { revenue: number; expense: number }>();
  months.forEach((m) => monthMap.set(m, { revenue: 0, expense: 0 }));
  for (const t of txns) {
    const k = monthKey(t.txn_date);
    const b = monthMap.get(k);
    if (!b) continue;
    if (t.amount > 0) b.revenue += t.amount;
    else b.expense += -t.amount;
  }
  // Running ending balance — start at cfg.startBal and add net per month
  // (only if start_date is null or precedes the FY). If we have no anchor,
  // ending balance starts at 0 and walks up/down.
  let running = cfg.startBal;
  const monthBuckets: MonthBucket[] = months.map((m) => {
    const b = monthMap.get(m)!;
    running += b.revenue - b.expense;
    return {
      label: monthLabel(m),
      revenue: b.revenue,
      expense: b.expense,
      ending: running,
    };
  });

  // ── YTD totals ─────────────────────────────────────────────────────────
  const revenueYTD = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenseYTD = txns.filter((t) => t.amount < 0).reduce((s, t) => s + -t.amount, 0);
  const netYTD = revenueYTD - expenseYTD;

  // ── 3-mo burn + sparkline ──────────────────────────────────────────────
  // Use last 3 *completed* months by spend; if FY just started we fall back
  // to whatever's there. Burn is positive.
  const monthlyBurn = monthBuckets.map((b) => b.expense);
  const completed = monthBuckets.filter((b) => b.expense > 0 || b.revenue > 0);
  const recentBurnSlice = completed.slice(-3).map((b) => b.expense);
  const burn3mo =
    recentBurnSlice.length > 0
      ? recentBurnSlice.reduce((s, x) => s + x, 0) / recentBurnSlice.length
      : 0;
  const runwayMonths = burn3mo > 0 ? cashOnHand / burn3mo : null;

  // ── Functional split donut (expenses by program / admin / fundraising) ──
  const functionalTotals = { program: 0, admin: 0, fundraising: 0, uncategorized: 0 };
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const cat = t.category_id ? catById.get(t.category_id) : null;
    const cls = cat?.functional_class;
    if (cls === "program") functionalTotals.program += -t.amount;
    else if (cls === "admin") functionalTotals.admin += -t.amount;
    else if (cls === "fundraising") functionalTotals.fundraising += -t.amount;
    else functionalTotals.uncategorized += -t.amount;
  }
  const functionalSegs: DonutSeg[] = [
    { label: "Program", value: functionalTotals.program, color: "#E8500A" },
    { label: "Admin", value: functionalTotals.admin, color: "#FAFAF8" },
    { label: "Fundraising", value: functionalTotals.fundraising, color: "#10b981" },
    { label: "Uncategorized", value: functionalTotals.uncategorized, color: "#f59e0b" },
  ].filter((s) => s.value > 0.0001);

  // ── Revenue source mix (from pledges + actual revenue txns) ────────────
  const pledges = (pledgesRes.data ?? []) as Array<{
    source_type: string;
    amount: number;
    status: string;
    probability: number | null;
  }>;
  const sourceTotals = new Map<string, number>();
  for (const p of pledges) {
    if (p.status !== "received") continue;
    sourceTotals.set(
      p.source_type,
      (sourceTotals.get(p.source_type) ?? 0) + Number(p.amount)
    );
  }
  // Augment with bank-side revenue not yet matched to a pledge — use the
  // category's id prefix to route to a source type.
  const sourceFromCat: Record<string, string> = {
    "revenue.foundations": "foundation",
    "revenue.individuals": "individual",
    "revenue.corporate": "corporate",
    "revenue.gov-grants": "government",
    "revenue.accelerator": "accelerator",
    "revenue.earned": "earned",
    "revenue.interest": "other",
    "revenue.other": "other",
  };
  for (const t of txns) {
    if (t.amount <= 0) continue;
    const cat = t.category_id ? catById.get(t.category_id) : null;
    const src = cat ? sourceFromCat[cat.id] ?? "other" : "other";
    sourceTotals.set(src, (sourceTotals.get(src) ?? 0) + t.amount);
  }
  const SOURCE_COLOR: Record<string, string> = {
    foundation: "#10b981",
    individual: "#E8500A",
    corporate: "#f59e0b",
    government: "#FAFAF8",
    accelerator: "#a78bfa",
    earned: "#60a5fa",
    other: "#6B6960",
  };
  const sourceSegs: DonutSeg[] = Array.from(sourceTotals.entries())
    .map(([k, v]) => ({
      label: k.charAt(0).toUpperCase() + k.slice(1),
      value: v,
      color: SOURCE_COLOR[k] ?? "#6B6960",
    }))
    .sort((a, b) => b.value - a.value);

  // ── Pledges summary ────────────────────────────────────────────────────
  // Manual pledges (fin_revenue_commitments) PLUS HubSpot deals that map
  // to a counted bucket. The HubSpot Sync button in the sidebar refreshes
  // the underlying hs_deals table; this just sums what's there.
  const securedTotal =
    pledges
      .filter((p) => p.status === "secured")
      .reduce((s, p) => s + Number(p.amount), 0) +
    hubspotPledges
      .filter((p) => p.status === "secured")
      .reduce((s, p) => s + p.amount, 0);
  const receivedTotal =
    pledges
      .filter((p) => p.status === "received")
      .reduce((s, p) => s + Number(p.amount), 0) +
    hubspotPledges
      .filter((p) => p.status === "received")
      .reduce((s, p) => s + p.amount, 0);
  const projectedWeighted =
    pledges
      .filter((p) => p.status === "projected")
      .reduce((s, p) => s + Number(p.amount) * (p.probability ?? 1), 0) +
    hubspotPledges
      .filter((p) => p.status === "projected")
      .reduce((s, p) => s + p.amount * p.probability, 0);
  const raisedHard = receivedTotal + securedTotal;

  // ── Budget vs actual (grouped) ──────────────────────────────────────────
  const budgetRows =
    (budgetRes.data ?? []) as Array<{
      category_id: string;
      base_amount: number;
      contingency_t1: number;
      contingency_t2: number;
      activated_contingency: number;
    }>;
  const budgetByCat = new Map(
    budgetRows.map((r) => [
      r.category_id,
      Number(r.base_amount) + Number(r.activated_contingency),
    ])
  );
  const actualByCat = new Map<string, number>();
  for (const t of txns) {
    if (t.amount >= 0 || !t.category_id) continue;
    actualByCat.set(t.category_id, (actualByCat.get(t.category_id) ?? 0) + -t.amount);
  }
  const totalBudget = Array.from(budgetByCat.values()).reduce((s, v) => s + v, 0);
  // Group rollups
  const groupRows = new Map<string, { budget: number; actual: number }>();
  for (const c of categories) {
    if (c.kind !== "expense") continue;
    const g = c.group_name;
    if (!groupRows.has(g)) groupRows.set(g, { budget: 0, actual: 0 });
    const r = groupRows.get(g)!;
    r.budget += budgetByCat.get(c.id) ?? 0;
    r.actual += actualByCat.get(c.id) ?? 0;
  }
  const budgetVsActual = Array.from(groupRows.entries())
    .map(([group, r]) => ({ group, ...r }))
    .filter((r) => r.budget > 0 || r.actual > 0)
    .sort((a, b) => b.budget - a.budget);

  // ── Misc ───────────────────────────────────────────────────────────────
  const uncategorizedCount = uncatRes.count ?? 0;
  const recent =
    (recentRes.data ?? []) as Array<{
      id: string;
      txn_date: string;
      description: string;
      amount: number;
      category_id: string | null;
    }>;

  const goalPct = cfg.goal > 0 ? raisedHard / cfg.goal : 0;
  const budgetPct = totalBudget > 0 ? expenseYTD / totalBudget : 0;

  // Friendly month-over-month for the cash hero card. Last completed month
  // net = (revenue - expense) of that month.
  const lastCompleted = [...monthBuckets].reverse().find((b) => b.expense > 0 || b.revenue > 0);
  const lastMoNet = lastCompleted ? lastCompleted.revenue - lastCompleted.expense : 0;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      {/* Header — SubNav now lives in app/admin/finance/layout.tsx so it
          persists across every finance page. */}
      <PageHeader
        eyebrow={`Fiscal year ${cfg.year}`}
        title="Dashboard"
        subtitle="Live picture of cash, burn, fundraising, and budget. Numbers update as transactions are imported, categorized, and pledges are received."
      />

      {/* Hero KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Hero
          label="Cash on hand"
          value={money(cashOnHand)}
          sub={
            cfg.startDate
              ? `since ${cfg.startDate}`
              : "set a starting balance in Config"
          }
          delta={lastMoNet}
          deltaLabel="last month"
          accent="orange"
        />
        <Hero
          label="Runway"
          value={
            runwayMonths === null
              ? "—"
              : `${runwayMonths.toFixed(1)} mo`
          }
          sub={
            burn3mo > 0
              ? `at ${money(burn3mo)}/mo burn`
              : "no burn signal yet"
          }
          sparkline={monthlyBurn}
        />
        <Hero
          label="Raised YTD"
          value={money(raisedHard)}
          sub={
            cfg.goal > 0
              ? `${Math.round(goalPct * 100)}% of ${money(cfg.goal)} goal`
              : "set a goal in Config"
          }
        >
          <CircleGauge
            pct={goalPct}
            value={`${Math.round(goalPct * 100)}%`}
            label="goal"
            color="#10b981"
          />
        </Hero>
        <Hero
          label="Spent YTD"
          value={money(expenseYTD)}
          sub={
            totalBudget > 0
              ? `${Math.round(budgetPct * 100)}% of ${money(totalBudget)} budget`
              : "no budget set"
          }
        >
          <CircleGauge
            pct={budgetPct}
            value={`${Math.round(budgetPct * 100)}%`}
            label="budget"
            color={budgetPct > 1 ? "#ef4444" : budgetPct > 0.8 ? "#f59e0b" : "#E8500A"}
          />
        </Hero>
      </section>

      {/* Secondary metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Mini label="Monthly burn (3-mo)" value={money(burn3mo)} />
        <Mini
          label="Net YTD"
          value={`${netYTD >= 0 ? "+" : "−"}${money(Math.abs(netYTD))}`}
          tone={netYTD >= 0 ? "good" : "warn"}
        />
        <Mini label="Pipeline (weighted)" value={money(projectedWeighted)} />
        <Mini
          label="Uncategorized"
          value={String(uncategorizedCount)}
          tone={uncategorizedCount > 0 ? "warn" : "good"}
          href="/admin/finance/transactions?category=uncategorized"
        />
      </section>

      {/* Cash flow chart */}
      <section className="rounded-card-lg border border-white/10 bg-white/[0.02] p-5 sm:p-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70 mb-1">
          Cash flow · 12 months
        </h2>
        <p className="text-xs text-gray-mid mb-4">
          Bars are revenue (up) and expense (down). The line traces ending
          balance, starting from the {money(cfg.startBal)} anchor.
        </p>
        <CashFlowChart data={monthBuckets} />
      </section>

      {/* Splits */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-card-lg border border-white/10 bg-white/[0.02] p-5 sm:p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70 mb-1">
            Functional split
          </h2>
          <p className="text-xs text-gray-mid mb-5">
            How {money(expenseYTD)} of expense breaks down across program,
            admin, and fundraising — the same split a Form 990 reports.
          </p>
          {functionalSegs.length > 0 ? (
            <Donut
              segments={functionalSegs}
              centerValue={`${
                functionalTotals.program /
                  Math.max(
                    1,
                    functionalTotals.program + functionalTotals.admin + functionalTotals.fundraising
                  ) *
                  100 >=
                10
                  ? Math.round(
                      (functionalTotals.program /
                        Math.max(
                          1,
                          functionalTotals.program +
                            functionalTotals.admin +
                            functionalTotals.fundraising
                        )) *
                        100
                    )
                  : "—"
              }%`}
              centerLabel="PROGRAM"
            />
          ) : (
            <Empty>
              Categorize some expenses to see the program / admin /
              fundraising split.
            </Empty>
          )}
        </div>

        <div className="rounded-card-lg border border-white/10 bg-white/[0.02] p-5 sm:p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70 mb-1">
            Revenue by source
          </h2>
          <p className="text-xs text-gray-mid mb-5">
            Received revenue plus actuals from bank transactions, grouped by
            who it came from. Projected pipeline shown separately below.
          </p>
          {sourceSegs.length > 0 ? (
            <Donut segments={sourceSegs} centerValue={money(raisedHard)} centerLabel="RAISED" />
          ) : (
            <Empty>
              Record received pledges or upload a revenue CSV to see the
              source mix.
            </Empty>
          )}
        </div>
      </section>

      {/* Budget vs actual */}
      <section className="rounded-card-lg border border-white/10 bg-white/[0.02] p-5 sm:p-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70">
            Budget vs actual
          </h2>
          <Link
            href="/admin/finance/budget"
            className="text-xs text-gray-mid hover:text-cream"
          >
            Edit budget →
          </Link>
        </div>
        {budgetVsActual.length === 0 ? (
          <Empty>Set a budget and import transactions to see this table.</Empty>
        ) : (
          <ul className="space-y-3">
            {budgetVsActual.map((r) => {
              const pct = r.budget > 0 ? r.actual / r.budget : 0;
              const intent: "ok" | "warn" | "over" =
                pct > 1 ? "over" : pct > 0.85 ? "warn" : "ok";
              return (
                <li key={r.group} className="text-xs">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="uppercase tracking-wider text-cream/85 font-medium">
                      {r.group}
                    </span>
                    <span className="font-mono text-cream/80">
                      {money(r.actual)} <span className="text-gray-mid">/ {money(r.budget)}</span>
                      <span
                        className={`ml-2 ${
                          intent === "over"
                            ? "text-red-300"
                            : intent === "warn"
                            ? "text-amber-300"
                            : "text-emerald-300"
                        }`}
                      >
                        {Math.round(pct * 100)}%
                      </span>
                    </span>
                  </div>
                  <ProgressBar pct={pct} intent={intent} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Bottom strip: pledges + recent transactions */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-card-lg border border-white/10 bg-white/[0.02] p-5 sm:p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70">
              Pledge pipeline
            </h2>
            <Link
              href="/admin/finance/revenue"
              className="text-xs text-gray-mid hover:text-cream"
            >
              Manage →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Cell label="Received" value={money(receivedTotal)} />
            <Cell label="Secured" value={money(securedTotal)} accent />
            <Cell label="Projected" value={money(projectedWeighted)} subtle />
          </div>
          <div className="text-[10px] uppercase tracking-wider text-gray-mid mb-2">
            Toward {money(cfg.goal)} goal
          </div>
          <ProgressBar pct={goalPct} intent={goalPct >= 1 ? "ok" : "warn"} height={10} />
          {cfg.goal > 0 && (
            <div className="text-xs text-gray-mid mt-2">
              {Math.round(goalPct * 100)}% hard ·{" "}
              {Math.round(((raisedHard + projectedWeighted) / cfg.goal) * 100)}% with weighted pipeline
            </div>
          )}
        </div>

        <div className="rounded-card-lg border border-white/10 bg-white/[0.02] p-5 sm:p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-cream/70">
              Recent transactions
            </h2>
            <Link
              href="/admin/finance/transactions"
              className="text-xs text-gray-mid hover:text-cream"
            >
              All →
            </Link>
          </div>
          {recent.length === 0 ? (
            <Empty>Upload a CSV to see transactions.</Empty>
          ) : (
            <ul className="text-xs">
              {recent.map((t) => {
                const c = t.category_id ? catById.get(t.category_id) : null;
                return (
                  <li
                    key={t.id}
                    className="grid grid-cols-[5rem_1fr_6rem] gap-3 py-1.5 border-t border-white/5 first:border-t-0"
                  >
                    <span className="font-mono text-cream/70">{t.txn_date.slice(5)}</span>
                    <span className="text-cream/85 truncate" title={t.description}>
                      {t.description}
                      {c && (
                        <span className="text-gray-mid text-[10px] ml-2">
                          {c.display_name}
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-right font-mono ${
                        Number(t.amount) >= 0 ? "text-emerald-300" : "text-cream/85"
                      }`}
                    >
                      {money(Number(t.amount))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Local UI bits ──────────────────────────────────────────────────────────

function Hero({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  accent,
  sparkline,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  deltaLabel?: string;
  accent?: "orange";
  sparkline?: number[];
  children?: React.ReactNode;
}) {
  const dotClass =
    accent === "orange" ? "text-orange" : "text-cream";
  return (
    <div className="relative rounded-card-lg border border-white/10 bg-white/[0.02] p-5 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-gray-mid">{label}</div>
          <div className={`mt-1 font-display font-black text-3xl ${dotClass} leading-none`}>
            {value}
          </div>
          {sub && <div className="mt-2 text-xs text-gray-mid">{sub}</div>}
          {typeof delta === "number" && Math.abs(delta) > 0.0001 && (
            <div className="mt-1 text-xs">
              <span className={delta >= 0 ? "text-emerald-300" : "text-red-300"}>
                {delta >= 0 ? "▲" : "▼"} {money(Math.abs(delta))}
              </span>{" "}
              <span className="text-gray-mid">{deltaLabel}</span>
            </div>
          )}
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 -mb-1">
          <Sparkline values={sparkline} width={220} height={36} color="#E8500A" />
        </div>
      )}
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
  href?: string;
}) {
  const valueClass =
    tone === "warn"
      ? "text-amber-300"
      : tone === "good"
      ? "text-emerald-300"
      : "text-cream";
  const inner = (
    <div className="rounded-card border border-white/10 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors">
      <div className="text-[10px] uppercase tracking-widest text-gray-mid mb-1">{label}</div>
      <div className={`text-lg font-medium ${valueClass}`}>{value}</div>
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-gray-mid py-8 text-center border border-dashed border-white/10 rounded-card">
      {children}
    </div>
  );
}

function Cell({
  label,
  value,
  accent,
  subtle,
}: {
  label: string;
  value: string;
  accent?: boolean;
  subtle?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-mid mb-1">{label}</div>
      <div
        className={`text-lg font-medium font-mono ${
          accent ? "text-orange" : subtle ? "text-cream/60" : "text-cream"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
