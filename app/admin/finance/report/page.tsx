import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getFinanceSnapshot } from "@/lib/admin/finance";
import type { FinCategory } from "@/lib/finance/types";
import { loadRevenueSchedule, loadReceivedTotal, scheduleTotals } from "@/lib/finance/schedule";
import { CashFlowChart, Donut, money, type DonutSeg } from "../_components/charts";
import PrintButton from "./_components/PrintButton";

// Board financial report — a print/PDF-ready one-pager pulling the
// board-meeting essentials from the same canonical sources as the dashboard, so
// the two always agree. Browser print-to-PDF (no heavy PDF lib); the @media
// print rule scopes output to #board-report so the admin chrome doesn't print.
export const dynamic = "force-dynamic";

function fiscalYearBounds(year: number, startMonth: number): { start: string; end: string } {
  if (startMonth === 1) return { start: `${year}-01-01`, end: `${year}-12-31` };
  const sm = String(startMonth).padStart(2, "0");
  const lastDay = new Date(year, startMonth - 1, 0).getDate();
  const em = String(startMonth - 1).padStart(2, "0");
  return { start: `${year - 1}-${sm}-01`, end: `${year}-${em}-${String(lastDay).padStart(2, "0")}` };
}

export default async function FinanceReportPage() {
  const supabase = getSupabaseAdmin();
  const snap = await getFinanceSnapshot();
  const cfg = snap.cfg;
  const fy = fiscalYearBounds(cfg.year, cfg.startMonth);

  const [catsRes, txnsRes, budgetRes, scheduleRows, receivedYTD] = await Promise.all([
    supabase.from("fin_categories").select("id, group_name, display_name, kind, functional_class, sort_order, enabled").eq("enabled", true).order("sort_order"),
    supabase.from("fin_transactions").select("amount, category_id").gte("txn_date", fy.start).lte("txn_date", fy.end),
    supabase.from("fin_budget").select("category_id, base_amount, activated_contingency").eq("year", cfg.year),
    loadRevenueSchedule(supabase),
    loadReceivedTotal(supabase, fy.start, fy.end),
  ]);

  const categories = (catsRes.data ?? []) as FinCategory[];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const txns = (txnsRes.data ?? []).map((t) => ({ amount: Number(t.amount), category_id: t.category_id as string | null }));

  // ── Functional split (program / admin / fundraising) ──
  const fn = { program: 0, admin: 0, fundraising: 0, uncategorized: 0 };
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const cls = t.category_id ? catById.get(t.category_id)?.functional_class : null;
    if (cls === "program") fn.program += -t.amount;
    else if (cls === "admin") fn.admin += -t.amount;
    else if (cls === "fundraising") fn.fundraising += -t.amount;
    else fn.uncategorized += -t.amount;
  }
  const fnClassified = fn.program + fn.admin + fn.fundraising;
  const programPct = fnClassified > 0 ? Math.round((fn.program / fnClassified) * 100) : null;
  const functionalSegs: DonutSeg[] = [
    { label: "Program", value: fn.program, color: "#C0703C" },
    { label: "Admin", value: fn.admin, color: "#2A201A" },
    { label: "Fundraising", value: fn.fundraising, color: "#2F7D5B" },
    { label: "Uncategorized", value: fn.uncategorized, color: "#B5762A" },
  ].filter((s) => s.value > 0.0001);

  // ── Fundraising (from the canonical revenue schedule + actual gifts) ──
  // Received = real money landed (gifts this fiscal year). Secured = committed
  // schedule; projected = weighted pipeline. No hs_deals.
  const totals = scheduleTotals(scheduleRows);
  const received = receivedYTD;
  const secured = totals.committed;
  const projectedWeighted = totals.projectedWeighted;
  const raisedHard = received + secured;
  const goalPct = cfg.goal > 0 ? Math.round((raisedHard / cfg.goal) * 100) : null;

  // ── Budget vs actual by group ──
  const budgetByCat = new Map(
    (budgetRes.data ?? []).map((r) => [r.category_id as string, Number(r.base_amount) + Number(r.activated_contingency)])
  );
  const actualByCat = new Map<string, number>();
  for (const t of txns) {
    if (t.amount >= 0 || !t.category_id) continue;
    actualByCat.set(t.category_id, (actualByCat.get(t.category_id) ?? 0) + -t.amount);
  }
  const groups = new Map<string, { budget: number; actual: number }>();
  for (const c of categories) {
    if (c.kind !== "expense") continue;
    const g = groups.get(c.group_name) ?? { budget: 0, actual: 0 };
    g.budget += budgetByCat.get(c.id) ?? 0;
    g.actual += actualByCat.get(c.id) ?? 0;
    groups.set(c.group_name, g);
  }
  const budgetRows = Array.from(groups.entries())
    .map(([group, r]) => ({ group, ...r }))
    .filter((r) => r.budget > 0 || r.actual > 0)
    .sort((a, b) => b.actual - a.actual);
  const totalBudget = budgetRows.reduce((s, r) => s + r.budget, 0);

  // ── Deterministic headline ──
  const runwayTxt = snap.runway.cash.months === null ? "no burn signal yet" : `${snap.runway.cash.months.toFixed(1)} months of cash runway at ${money(snap.runway.inputs.baseline)}/mo`;
  const goalTxt = cfg.goal > 0 ? `raised ${money(raisedHard)} of the ${money(cfg.goal)} goal (${goalPct}%)` : `raised ${money(raisedHard)}`;
  const netTxt = `net ${snap.netYTD >= 0 ? "surplus" : "deficit"} of ${money(Math.abs(snap.netYTD))} YTD`;
  const headline = `${money(snap.cashOnHand)} cash on hand — ${runwayTxt}. ${goalTxt[0].toUpperCase()}${goalTxt.slice(1)}; ${netTxt}.`;

  const asOf = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const reconciledTxt = cfg.reconciledAt
    ? `Cash reconciled ${new Date(cfg.reconciledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : "Cash not yet reconciled to the bank";

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8">
      <style
        dangerouslySetInnerHTML={{
          __html:
            "@media print{body *{visibility:hidden}#board-report,#board-report *{visibility:visible}#board-report{position:absolute;left:0;top:0;width:100%;padding:0}.no-print{display:none!important}}",
        }}
      />

      <div className="flex items-center justify-between gap-4 mb-5 no-print">
        <p className="text-xs text-ink-2">A print-ready snapshot for the board. Numbers match the Finance dashboard.</p>
        <PrintButton />
      </div>

      <div id="board-report" className="bg-white text-ink-1 rounded-card-lg border-[1.5px] border-outline p-8 space-y-7">
        {/* Title */}
        <header className="border-b border-outline pb-4">
          <div className="text-[11px] uppercase tracking-widest text-ink-2">Ambition Angels · Board Financial Report</div>
          <h1 className="font-heading font-bold text-2xl text-ink-1 mt-1">Fiscal Year {cfg.year}</h1>
          <div className="text-xs text-ink-2 mt-1">As of {asOf} · {reconciledTxt}</div>
        </header>

        {/* Headline */}
        <p className="text-sm text-ink-1 leading-relaxed">{headline}</p>

        {/* KPIs */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Kpi label="Cash on hand" value={money(snap.cashOnHand)} />
          <Kpi label="Cash runway" value={snap.runway.cash.months === null ? "—" : `${snap.runway.cash.months.toFixed(1)} mo`} sub={`${money(snap.runway.inputs.baseline)}/mo burn`} />
          <Kpi label="Raised YTD" value={money(raisedHard)} sub={goalPct === null ? undefined : `${goalPct}% of goal`} />
          <Kpi label="Net YTD" value={`${snap.netYTD >= 0 ? "+" : "−"}${money(Math.abs(snap.netYTD))}`} />
        </section>

        {/* Cash flow */}
        <section>
          <SectionTitle>Cash flow · 12 months</SectionTitle>
          {snap.monthBuckets.some((b) => b.revenue > 0 || b.expense > 0) ? (
            <div className="overflow-x-auto">
              <CashFlowChart data={snap.monthBuckets} width={700} height={190} />
            </div>
          ) : (
            <Empty>No transactions recorded for FY {cfg.year} yet.</Empty>
          )}
        </section>

        {/* Functional + fundraising */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div>
            <SectionTitle>Expense by function</SectionTitle>
            {functionalSegs.length > 0 ? (
              <Donut segments={functionalSegs} size={150} thickness={22} centerValue={programPct === null ? "—" : `${programPct}%`} centerLabel="PROGRAM" />
            ) : (
              <Empty>Categorize expenses to see the program / admin / fundraising split.</Empty>
            )}
          </div>
          <div>
            <SectionTitle>Fundraising</SectionTitle>
            <dl className="text-sm space-y-1.5">
              <Row label="Received" value={money(received)} />
              <Row label="Secured (committed)" value={money(secured)} />
              <Row label="Projected (weighted)" value={money(projectedWeighted)} muted />
              <Row label="Raised vs goal" value={cfg.goal > 0 ? `${money(raisedHard)} / ${money(cfg.goal)}` : money(raisedHard)} strong />
              {cfg.goal > 0 && (
                <div className="pt-2">
                  <div className="h-2.5 rounded-full bg-[#F0EEE8] overflow-hidden">
                    <div className="h-full rounded-full bg-revenue" style={{ width: `${Math.min(100, goalPct ?? 0)}%` }} />
                  </div>
                  <div className="text-[11px] text-ink-2 mt-1">
                    {goalPct}% hard · {Math.round(((raisedHard + projectedWeighted) / cfg.goal) * 100)}% with weighted pipeline
                  </div>
                </div>
              )}
            </dl>
          </div>
        </section>

        {/* Budget vs actual */}
        <section>
          <SectionTitle>Budget vs actual{totalBudget > 0 ? ` · ${money(totalBudget)} budgeted` : ""}</SectionTitle>
          {budgetRows.length === 0 ? (
            <Empty>Set a budget and import transactions to see this table.</Empty>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-2 uppercase tracking-wider border-b border-outline">
                  <th className="text-left py-1.5">Group</th>
                  <th className="text-right py-1.5">Actual</th>
                  <th className="text-right py-1.5">Budget</th>
                  <th className="text-right py-1.5">% used</th>
                </tr>
              </thead>
              <tbody>
                {budgetRows.map((r) => {
                  const pct = r.budget > 0 ? Math.round((r.actual / r.budget) * 100) : null;
                  return (
                    <tr key={r.group} className="border-b border-hairline">
                      <td className="py-1.5 uppercase tracking-wide text-ink-1">{r.group}</td>
                      <td className="py-1.5 text-right font-mono">{money(r.actual)}</td>
                      <td className="py-1.5 text-right font-mono text-ink-2">{r.budget > 0 ? money(r.budget) : "—"}</td>
                      <td className={`py-1.5 text-right font-mono ${pct !== null && pct > 100 ? "text-expense" : "text-ink-1"}`}>{pct === null ? "—" : `${pct}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <footer className="border-t border-outline pt-3 text-[10px] text-ink-2">
          Generated {asOf} from imported bank transactions and recorded pledges. Runway = cash on hand ÷ trailing 3-month average expense.
          Forecast figures exclude closed-lost. Figures match the BloomOS Finance dashboard.
        </footer>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-outline rounded-card p-3">
      <div className="text-[10px] uppercase tracking-widest text-ink-2">{label}</div>
      <div className="font-heading font-bold text-lg text-ink-1 mt-0.5 [font-variant-numeric:tabular-nums]">{value}</div>
      {sub && <div className="text-[11px] text-ink-2 mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading font-semibold text-sm text-ink-1 mb-3">{children}</h2>;
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${strong ? "pt-1.5 border-t border-hairline font-semibold text-ink-1" : muted ? "text-ink-2" : "text-ink-1"}`}>
      <dt>{label}</dt>
      <dd className="font-mono [font-variant-numeric:tabular-nums]">{value}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-ink-2 py-6 text-center border border-dashed border-outline rounded-card">{children}</div>;
}
