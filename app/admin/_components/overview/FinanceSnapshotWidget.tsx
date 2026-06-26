import { getFinance } from "@/lib/admin/overview/sources";
import { money } from "../../finance/_components/charts";
import { runwayTone } from "./RunwayCard";
import { Widget } from "./shared";

// Finance snapshot — the one finance card on the CEO cockpit: the cash runway
// leads (bank net of this month's spend over the burn baseline, amber < 3 /
// critical < 1.5), with the due/projected tiers and cash/burn/net beneath. The
// full cash-flow chart lives on the Finance page.

const VALUE_TONE = { ok: "text-ink-1", amber: "text-orange", critical: "text-expense" } as const;
const fmtMo = (m: number | null) => (m === null ? "—" : m.toFixed(1));

export default async function FinanceSnapshotWidget({
  title = "Finance snapshot",
  className,
}: {
  title?: string;
  className?: string;
}) {
  const d = await getFinance();
  const { cash, due, projected, inputs } = d.runway;
  const tone = runwayTone(cash.months);
  const net = d.revenueYTD - d.expenseYTD;

  return (
    <Widget title={title} href="/admin/finance" hrefLabel="Finance" className={className}>
      <div className="flex items-baseline gap-3">
        <span className={`font-heading font-bold text-4xl [font-variant-numeric:tabular-nums] ${VALUE_TONE[tone]}`}>
          {fmtMo(cash.months)}
        </span>
        <span className="text-sm text-ink-1 font-medium">months of cash runway</span>
      </div>
      <p className="text-[11px] text-ink-3 mt-1">
        beyond now · with pledges due {fmtMo(due.months)} · projected {fmtMo(projected.months)}
      </p>

      <dl className="mt-4 pt-4 border-t border-hairline grid grid-cols-3 gap-3">
        {[
          { label: "Cash on hand", value: money(d.cashOnHand), cls: "text-ink-1" },
          { label: "Monthly burn", value: money(inputs.baseline), cls: "text-expense" },
          { label: "Net YTD", value: money(net), cls: net >= 0 ? "text-revenue" : "text-expense" },
        ].map((c) => (
          <div key={c.label}>
            <dt className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-1">{c.label}</dt>
            <dd className={`font-heading font-semibold text-base [font-variant-numeric:tabular-nums] ${c.cls}`}>{c.value}</dd>
          </div>
        ))}
      </dl>
    </Widget>
  );
}
