import { getFinance } from "@/lib/admin/overview/sources";
import { CashFlowChart, money } from "../../finance/_components/charts";
import { Widget, Empty } from "./shared";

// Revenue / expense / net plus the 12-month cash-flow chart. Shared between the
// CEO cockpit (supporting the runway hero) and finance deep-links.

export default async function FinancialHealthWidget({ className }: { className?: string }) {
  const d = await getFinance();
  const net = d.revenueYTD - d.expenseYTD;
  const cells = [
    { label: "Revenue YTD", value: money(d.revenueYTD), cls: "text-revenue" },
    { label: "Expenses YTD", value: money(d.expenseYTD), cls: "text-expense" },
    { label: "Net Surplus", value: money(net), cls: net >= 0 ? "text-revenue" : "text-expense" },
  ];
  const hasData = d.monthBuckets.some((b) => b.revenue > 0 || b.expense > 0);

  return (
    <Widget title="Financial Health" href="/admin/finance" hrefLabel="Finance" className={className}>
      <div className="grid grid-cols-3 gap-4 mb-5">
        {cells.map((s) => (
          <div key={s.label}>
            <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-1">{s.label}</div>
            <div className={`font-heading font-semibold text-lg [font-variant-numeric:tabular-nums] ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>
      {hasData ? (
        <div className="overflow-x-auto">
          <CashFlowChart data={d.monthBuckets} width={760} height={200} />
        </div>
      ) : (
        <Empty>No transactions recorded for FY {d.cfg.year} yet — import them under Finance.</Empty>
      )}
    </Widget>
  );
}
