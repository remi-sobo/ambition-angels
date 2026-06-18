import { getForecast } from "@/lib/admin/overview/sources";
import { money } from "../../finance/_components/charts";
import { Widget, Empty } from "./shared";

// Goal + forecast. Forecast = committed (gifts raised + stewardship asks) +
// weighted open (Σ ask × probability) — never total pipeline. Shows raised,
// forecast, goal, and the dollar gap.

export default async function GoalForecastWidget({ className }: { className?: string }) {
  const f = await getForecast();

  if (f.goal <= 0) {
    return (
      <Widget title="Goal &amp; Forecast" href="/admin/fundraising" hrefLabel="Fundraising" className={className}>
        <Empty>Set an FY fundraising goal under Finance to see the gap to target.</Empty>
      </Widget>
    );
  }

  const pct = (n: number) => `${Math.min(Math.max((n / f.goal) * 100, 0), 100)}%`;
  const raisedPct = pct(f.committed);
  const forecastPct = pct(f.forecast);
  const overGoal = f.gap < 0;

  return (
    <Widget title="Goal &amp; Forecast" href="/admin/fundraising" hrefLabel="Fundraising" className={className}>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="font-heading font-bold text-ink-1 text-2xl [font-variant-numeric:tabular-nums]">{money(f.forecast)}</span>
        <span className="text-xs text-ink-2">forecast of {money(f.goal)} goal</span>
      </div>

      {/* Stacked bar: committed (solid) → forecast (lighter) → remaining gap */}
      <div className="relative h-3 bg-tile rounded-full overflow-hidden my-3">
        <div className="absolute inset-y-0 left-0 rounded-full bg-orange/40" style={{ width: forecastPct }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-orange" style={{ width: raisedPct }} />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        <dt className="text-ink-3">Raised (gifts)</dt>
        <dd className="text-right text-ink-1 font-semibold [font-variant-numeric:tabular-nums]">{money(f.raised)}</dd>
        <dt className="text-ink-3">+ Stewardship asks</dt>
        <dd className="text-right text-ink-1 [font-variant-numeric:tabular-nums]">{money(f.committedSteward)}</dd>
        <dt className="text-ink-3">+ Weighted open</dt>
        <dd className="text-right text-ink-1 [font-variant-numeric:tabular-nums]">{money(f.weightedOpen)}</dd>
        <dt className="text-ink-1 font-semibold pt-1 border-t border-hairline">{overGoal ? "Over goal by" : "Gap to goal"}</dt>
        <dd className={`text-right font-bold pt-1 border-t border-hairline [font-variant-numeric:tabular-nums] ${overGoal ? "text-revenue" : "text-expense"}`}>
          {money(Math.abs(f.gap))}
        </dd>
      </dl>
    </Widget>
  );
}
