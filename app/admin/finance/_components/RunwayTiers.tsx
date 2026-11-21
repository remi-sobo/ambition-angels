"use client";

import { useMemo, useState } from "react";
import {
  computeRunway,
  summarizePledges,
  type RunwayPledge,
} from "@/lib/finance/runway";
import { money } from "./charts";
import { TYPE } from "@/lib/admin/typeScale";
import Figure from "@/app/admin/_components/ui/Figure";
import Button from "@/app/admin/_components/ui/Button";

// Three-tier forward runway (V4 Stage G2: kit Figures, each with its source).
// On the snapshot it opens from "How runway is figured"; the Friday close
// shows it before the stamp. All three
// numbers come from the shared pure engine (lib/finance/runway): cash (bank net
// of this month's remaining spend), due (+ unreceived pledges due by month end),
// and projected (+ unreceived pledges within the horizon). Full value, never
// probability-weighted; restricted and received excluded; undated surfaced as a
// nudge. D1: "months beyond now" — no +1.
//
// The horizon toggle re-buckets the projected tier client-side using the same
// engine and server-computed month-end dates (no round-trip, no client date
// math). Cash and due don't move with the horizon.

const HORIZONS = [3, 6, 12] as const;
type Horizon = (typeof HORIZONS)[number];

const fmtMonths = (m: number | null) => (m === null ? null : `${m.toFixed(1)} months`);

export default function RunwayTiers({
  baseline,
  baselineSource,
  bankBalance,
  mtdSpend,
  endCurrentMonth,
  horizonEnds,
  defaultHorizon,
  pledges,
  restrictedInflows = 0,
  framed = true,
}: {
  baseline: number;
  baselineSource: "config" | "trailing";
  bankBalance: number;
  mtdSpend: number;
  /** ISO date, last day of the current month. */
  endCurrentMonth: string;
  /** ISO date for the last day of the month N months out, keyed by N. */
  horizonEnds: Record<Horizon, string>;
  defaultHorizon: number;
  /**
   * Unreceived inflows from the revenue schedule: committed at full value,
   * projected pipeline already probability-weighted. summarize filters the rest.
   */
  pledges: RunwayPledge[];
  /** Restricted inflows, excluded from every tier: shown as a carve-out note. */
  restrictedInflows?: number;
  /** false inside a drawer, which supplies its own frame. */
  framed?: boolean;
}) {
  const initial: Horizon = (HORIZONS as readonly number[]).includes(defaultHorizon)
    ? (defaultHorizon as Horizon)
    : 3;
  const [horizon, setHorizon] = useState<Horizon>(initial);

  const { runway, undated } = useMemo(() => {
    const sums = summarizePledges(pledges, endCurrentMonth, horizonEnds[horizon]);
    return {
      runway: computeRunway({
        baseline,
        baselineSource,
        bankBalance,
        mtdSpend,
        duePledges: sums.duePledges,
        projPledges: sums.projPledges,
        horizonMonths: horizon,
      }),
      undated: sums.undatedUnreceivedCount,
    };
  }, [pledges, endCurrentMonth, horizonEnds, horizon, baseline, baselineSource, bankBalance, mtdSpend]);

  const monthLabel = new Date(endCurrentMonth + "T00:00:00").toLocaleDateString("en-US", { month: "long" });
  const per = `${money(baseline)} a month (${baselineSource === "config" ? "your burn baseline" : "3-month average spend"})`;
  const noBurn = "No monthly spending to divide by yet.";

  return (
    <section
      aria-label="Runway three ways"
      className={framed ? "bg-surface border border-hairline rounded-panel p-5" : ""}
    >
      <p className={`${TYPE.bodyMuted} mb-4`}>
        How many months the money lasts beyond this month, at {per}. Pledges count at full value; received,
        restricted and undated money is left out.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Figure
          layout="card"
          label="Cash only"
          value={fmtMonths(runway.cash.months)}
          source={runway.cash.months === null ? noBurn : `${money(runway.cash.base)}: bank balance less what is left to spend this month.`}
        />
        <Figure
          layout="card"
          label="With pledges due"
          value={fmtMonths(runway.due.months)}
          source={runway.due.months === null ? noBurn : `${money(runway.due.base)}: adds pledges due by the end of ${monthLabel}.`}
        />
        <Figure
          layout="card"
          label={`Projected, ${horizon} months`}
          value={fmtMonths(runway.projected.months)}
          source={
            runway.projected.months === null
              ? noBurn
              : `${money(runway.projected.base)}: adds pledges due within ${horizon} months.`
          }
          extra={
            <div role="group" aria-label="Projection window" className="flex gap-1">
              {HORIZONS.map((h) => (
                <Button
                  key={h}
                  size="sm"
                  variant={h === horizon ? "strong" : "secondary"}
                  aria-pressed={h === horizon}
                  onClick={() => setHorizon(h)}
                >
                  {h} months
                </Button>
              ))}
            </div>
          }
        />
      </div>

      <div className="mt-4 space-y-1.5 text-[13px] text-ink-2">
        <p>
          Projected ignores timing inside the window: a pledge late in it can hide a gap earlier on. Read it with the
          cash chart, not on its own.
        </p>
        {undated > 0 ? (
          <p>
            <span className="text-status-watch-text font-semibold">
              {undated} pledge{undated === 1 ? "" : "s"} missing a date
            </span>
            , not counted in any tier. Add expected dates on{" "}
            <a href="/admin/finance/forecast" className="underline underline-offset-2 hover:text-ink-1">
              Forecast
            </a>{" "}
            to include them.
          </p>
        ) : null}
        {restrictedInflows > 0 ? (
          <p>
            <span className="text-ink-1 font-semibold">{money(restrictedInflows)} restricted</span> is left out of every
            tier. Restricted money cannot cover general operating costs.
          </p>
        ) : null}
      </div>
    </section>
  );
}
