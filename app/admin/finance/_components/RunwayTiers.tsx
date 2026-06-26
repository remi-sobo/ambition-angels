"use client";

import { useMemo, useState } from "react";
import {
  computeRunway,
  summarizePledges,
  type RunwayPledge,
} from "@/lib/finance/runway";
import { money } from "./charts";

// Three-tier forward runway, the headline of the Finance dashboard. All three
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

function tone(months: number | null): { value: string; chipBg: string; chipText: string; label: string } {
  if (months === null) return { value: "text-ink-2", chipBg: "bg-tile border-outline", chipText: "text-ink-2", label: "no baseline" };
  if (months < 1.5) return { value: "text-expense", chipBg: "bg-expense-bg border-expense/30", chipText: "text-expense", label: "critical" };
  if (months < 3) return { value: "text-orange", chipBg: "bg-orange/15 border-orange/30", chipText: "text-orange", label: "tightening" };
  return { value: "text-ink-1", chipBg: "bg-revenue-bg border-revenue/30", chipText: "text-revenue", label: "healthy" };
}

const fmtMonths = (m: number | null) => (m === null ? "—" : m.toFixed(1));

export default function RunwayTiers({
  baseline,
  baselineSource,
  bankBalance,
  mtdSpend,
  endCurrentMonth,
  horizonEnds,
  defaultHorizon,
  pledges,
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
  /** Unreceived pledges (Bloom + HubSpot), full value. summarize filters the rest. */
  pledges: RunwayPledge[];
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

  const cashTone = tone(runway.cash.months);
  const monthLabel = new Date(endCurrentMonth + "T00:00:00").toLocaleDateString("en-US", { month: "long" });

  return (
    <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-2">Forward runway</div>
          <p className="mt-1 text-xs text-ink-2 max-w-xl">
            How long the money lasts, three ways — cash today, plus what&apos;s owed and pledged. Months
            beyond the current month, at{" "}
            <span className="text-ink-1 font-medium">{money(baseline)}/mo</span>{" "}
            {baselineSource === "config" ? "burn baseline" : "trailing 3-month burn"}.
          </p>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cashTone.chipBg} ${cashTone.chipText}`}>
          {cashTone.label}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tier
          label="Cash runway"
          months={fmtMonths(runway.cash.months)}
          valueClass={cashTone.value}
          base={runway.cash.base}
          note="bank net of this month's remaining spend"
        />
        <Tier
          label="With pledges due"
          months={fmtMonths(runway.due.months)}
          valueClass="text-ink-1"
          base={runway.due.base}
          note={`+ unreceived pledges due by end of ${monthLabel}`}
        />
        <Tier
          label="Projected"
          months={fmtMonths(runway.projected.months)}
          valueClass="text-ink-1"
          base={runway.projected.base}
          note={`+ unreceived pledges due within ${horizon} months`}
          trailing={
            <div className="inline-flex rounded-md border border-outline overflow-hidden mt-2">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    h === horizon ? "bg-orange text-white" : "text-ink-2 hover:bg-tile"
                  }`}
                >
                  {h}m
                </button>
              ))}
            </div>
          }
        />
      </div>

      <div className="mt-4 pt-4 border-t border-hairline space-y-1.5 text-[11px] text-ink-2">
        <p>
          <span className="text-[#A56A1B]">Projected ignores timing within the window</span> — a pledge
          late in the horizon can paper over a gap earlier in it. Read it with the cash-flow chart below,
          not on its own.
        </p>
        {undated > 0 && (
          <p>
            <span className="text-[#A56A1B]">{undated} pledge{undated === 1 ? "" : "s"} missing a date</span>{" "}
            — not counted in any tier. Add expected dates on{" "}
            <a href="/admin/finance/revenue" className="underline hover:text-ink-1">Revenue</a> to include them.
          </p>
        )}
      </div>
    </section>
  );
}

function Tier({
  label,
  months,
  valueClass,
  base,
  note,
  trailing,
}: {
  label: string;
  months: string;
  valueClass: string;
  base: number;
  note: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border-[1.5px] border-outline bg-tile p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-display font-black text-4xl leading-none ${valueClass}`}>{months}</span>
        <span className="text-xs text-ink-2">mo</span>
      </div>
      <div className="mt-2 text-[11px] text-ink-2">{note}</div>
      <div className="mt-1 text-[11px] font-mono text-ink-2">{money(base)} runway base</div>
      {trailing}
    </div>
  );
}
