import { getFinance } from "@/lib/admin/overview/sources";
import { money, Sparkline } from "../../finance/_components/charts";

// Runway hero — the one number that should dominate the CEO's screen. The
// headline is the cash tier (bank net of this month's remaining spend, over the
// burn baseline; "months beyond now"). The due/projected tiers sit beneath it.
// Amber under 3 months, critical under 1.5 (spec's locked thresholds).

export type RunwayTone = "ok" | "amber" | "critical";

export function runwayTone(months: number | null): RunwayTone {
  if (months === null) return "ok";
  if (months < 1.5) return "critical";
  if (months < 3) return "amber";
  return "ok";
}

const TONE: Record<RunwayTone, { value: string; chip: string; chipText: string }> = {
  ok: { value: "text-ink-1", chip: "bg-revenue-bg border-revenue/30", chipText: "text-revenue" },
  amber: { value: "text-orange", chip: "bg-orange/15 border-orange/30", chipText: "text-orange" },
  critical: { value: "text-expense", chip: "bg-expense-bg border-expense/30", chipText: "text-expense" },
};

const fmtMo = (m: number | null) => (m === null ? "—" : m.toFixed(1));

export default async function RunwayCard() {
  const d = await getFinance();
  const { cash, due, projected, inputs } = d.runway;
  const tone = runwayTone(cash.months);
  const t = TONE[tone];
  const spark = d.monthBuckets.filter((b) => b.revenue > 0 || b.expense > 0).map((b) => b.ending);
  const label =
    tone === "critical" ? "Critical — raise or cut now" : tone === "amber" ? "Tightening — watch closely" : "Healthy";
  const burnLabel = inputs.baselineSource === "config" ? "burn baseline (set)" : "trailing 3-month burn";

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3">
        <h2 className="font-heading font-bold text-ink-1 text-sm">Runway &amp; cash</h2>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${t.chip} ${t.chipText}`}>{label}</span>
      </div>
      <div className="p-5 grid grid-cols-1 lg:grid-cols-[auto,1fr] gap-6 items-center">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-1">Cash runway · months beyond now</div>
          <div className={`font-heading font-bold text-5xl [font-variant-numeric:tabular-nums] ${t.value}`}>
            {fmtMo(cash.months)}
          </div>
          <div className="mt-2 flex gap-5 text-sm">
            <span className="text-ink-3">
              with pledges due{" "}
              <span className="text-ink-1 font-semibold [font-variant-numeric:tabular-nums]">{fmtMo(due.months)}</span>
            </span>
            <span className="text-ink-3">
              projected{" "}
              <span className="text-ink-1 font-semibold [font-variant-numeric:tabular-nums]">{fmtMo(projected.months)}</span>
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <span className="text-ink-3">Cash on hand</span>
            <span className="text-ink-1 font-semibold text-right [font-variant-numeric:tabular-nums]">{money(d.cashOnHand)}</span>
            <span className="text-ink-3">Monthly burn</span>
            <span className="text-ink-1 font-semibold text-right [font-variant-numeric:tabular-nums]">{money(inputs.baseline)}</span>
            <span className="text-ink-3 text-[11px] col-span-2 mt-0.5">{burnLabel}</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-2">Ending balance trend</div>
          {spark.length > 1 ? (
            <Sparkline values={spark} width={420} height={64} />
          ) : (
            <p className="text-ink-2 text-sm">Import finance transactions to see the trend.</p>
          )}
        </div>
      </div>
    </section>
  );
}
