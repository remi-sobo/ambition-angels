import type { MoneySummary } from "@/lib/admin/strategy/narrative";
import { FINANCE } from "@/lib/admin/thresholds";
import type { Status } from "@/lib/admin/status";
import { formatUsd, MovementHeader, StatBig } from "./shared";

/**
 * Movement 2 — What We Need to Raise. Targets (floor, ceiling) come from the
 * OGSM via plan_kpis; actuals (secured, weighted pipeline, cash, runway,
 * allocation) are computed from finance. The two never drift because they have
 * different sources — and every dollar is counted in exactly one state.
 */

// Runway months → status, reading the cutoffs from the central thresholds
// module (never a hardcoded literal here).
function runwayStatus(months: number | null, cash: number): Status {
  if (months == null) return "neutral";
  if (months <= FINANCE.runwayCriticalMonths) return "critical";
  if (months <= FINANCE.runwayWatchMonths || cash <= FINANCE.cashFloorUsd) return "watch";
  return "healthy";
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function MovementRaise({ money }: { money: MoneySummary }) {
  const { floor, ceiling, secured, weightedPipeline, gap, realistic, cashOnHand, runwayMonths, allocation } = money;

  const securedPct = floor && floor > 0 ? Math.min(100, Math.round((secured / floor) * 100)) : null;
  const realisticPct = floor && floor > 0 ? Math.min(100, Math.round((realistic / floor) * 100)) : null;
  const stagedT1 = allocation.reduce((s, a) => s + a.stagedT1, 0);
  const stagedT2 = allocation.reduce((s, a) => s + a.stagedT2, 0);
  const staged = stagedT1 + stagedT2;
  // Bars show committed-floor lines only; a fully-staged group (base 0) lives in
  // the staged footer, not as an empty $0 bar.
  const bars = allocation.filter((a) => a.base > 0);
  const maxBase = bars.reduce((m, a) => Math.max(m, a.base), 0) || 1;

  // The lead sentence, assembled live from the numbers on screen.
  const lead = (
    <>
      The plan rebases to a committed floor of <strong>{formatUsd(floor)}</strong>. We&apos;ve secured{" "}
      <strong>{formatUsd(secured)}</strong>; a realistic close lands near <strong>{formatUsd(realistic)}</strong>
      {gap != null && gap > 0 ? (
        <>
          , leaving <strong>{formatUsd(gap)}</strong> of net-new money to clear it.
        </>
      ) : (
        <>.</>
      )}
    </>
  );

  return (
    <div>
      <MovementHeader n={2} title="What We Need to Raise" lead={lead} />

      {/* Progress toward the floor: secured (solid) within realistic (open). */}
      {floor != null && (
        <div className="mb-8 rounded-card-lg border border-hairline bg-surface p-5">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3">
              Toward the committed floor
            </span>
            <span className="text-sm tabular-nums text-ink-2">
              {formatUsd(secured)} secured · {formatUsd(realistic)} realistic / {formatUsd(floor)}
            </span>
          </div>
          <div className="relative h-3 rounded-full bg-tile overflow-hidden">
            {realisticPct != null && (
              <div className="absolute inset-y-0 left-0 bg-orange/25" style={{ width: `${realisticPct}%` }} />
            )}
            {securedPct != null && (
              <div className="absolute inset-y-0 left-0 bg-orange" style={{ width: `${securedPct}%` }} />
            )}
          </div>
          <div className="mt-1.5 text-[12px] text-ink-3">
            {securedPct ?? 0}% secured · {realisticPct ?? 0}% on a realistic close
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        <StatBig label="Committed floor" value={formatUsd(floor)} sub="the necessary plan" accent />
        <StatBig label="Secured to date" value={formatUsd(secured)} sub="raised this fiscal year" />
        <StatBig label="Gap to floor" value={formatUsd(gap)} sub="net-new still to raise" />
        <StatBig label="Weighted pipeline" value={formatUsd(weightedPipeline)} sub="open asks × probability" />
        <StatBig label="Realistic close" value={formatUsd(realistic)} sub="secured + weighted" />
        <StatBig
          label="Cash runway"
          value={runwayMonths == null ? "—" : `${runwayMonths % 1 === 0 ? runwayMonths : runwayMonths.toFixed(1)} mo`}
          sub={`${formatUsd(cashOnHand)} on hand`}
          status={runwayStatus(runwayMonths, cashOnHand)}
        />
      </div>

      {/* Stage to the ceiling. */}
      {ceiling != null && floor != null && ceiling > floor && (
        <div className="mb-8 rounded-card border border-hairline bg-tile px-5 py-3 text-sm text-ink-2">
          Stage to the ceiling: <strong className="text-ink-1">{formatUsd(ceiling)}</strong> everything-on, unlocking{" "}
          <strong className="text-ink-1">{formatUsd(ceiling - floor)}</strong> of staged tiers as money lands.
        </div>
      )}

      {/* Where the floor goes — fin_budget by category group. */}
      {bars.length > 0 && (
        <div className="rounded-card-lg border border-hairline bg-surface p-5">
          <div className="text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3 mb-3">
            Where the committed floor goes
          </div>
          <div className="space-y-2.5">
            {bars.map((a) => (
              <div key={a.group}>
                <div className="flex items-baseline justify-between text-sm mb-1">
                  <span className="text-ink-1">{titleCase(a.group)}</span>
                  <span className="tabular-nums text-ink-2">{formatUsd(a.base)}</span>
                </div>
                <div className="h-2 rounded-full bg-tile overflow-hidden">
                  <div className="h-full bg-orange/70" style={{ width: `${Math.round((a.base / maxBase) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          {staged > 0 && (
            <div className="mt-4 pt-3 border-t border-hairline text-[12px] text-ink-3">
              Plus <strong className="text-ink-2">{formatUsd(staged)}</strong> staged, off the floor — unlocks as
              money lands{stagedT1 > 0 && <> (tier 1 {formatUsd(stagedT1)}</>}
              {stagedT2 > 0 && <>, tier 2 {formatUsd(stagedT2)}</>}
              {stagedT1 > 0 && <>)</>}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
