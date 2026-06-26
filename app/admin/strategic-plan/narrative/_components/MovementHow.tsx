import type { HowMovement } from "@/lib/admin/strategy/narrative";
import { StatusChip } from "../../../_components/StatusChip";
import { formatUsd, MovementHeader, STATUS_LABEL } from "./shared";

/**
 * Movement 3 — How We Raise It. The funding doors (strategy_angles) with their
 * live funnel counts (funder_angles), the live pipeline by stage
 * (opportunities), and channel progress (plan_kpis: corporate, AIG). All read
 * live; the doors and the pipeline never disagree with the CRM.
 */

const STAGE_LABEL: Record<string, string> = {
  identify: "Identify",
  qualify: "Qualify",
  cultivate: "Cultivate",
  solicit: "Solicit",
  steward: "Steward",
};

export default function MovementHow({ how }: { how: HowMovement }) {
  const { angles, pipelineByStage, channels } = how;
  const totalFunders = angles.reduce((s, a) => s + a.funderCount, 0);
  const maxStage = pipelineByStage.reduce((m, s) => Math.max(m, s.count), 0) || 1;

  return (
    <div>
      <MovementHeader
        n={3}
        title="How We Raise It"
        lead={
          <>
            Eight doors into the same plan — each a frame a funder already cares about, with{" "}
            <strong>{totalFunders}</strong> funders mapped against them — converted through one live
            pipeline.
          </>
        }
      />

      {/* The doors. */}
      <div className="grid sm:grid-cols-2 gap-3 mb-10">
        {angles.map((a) => (
          <div key={a.id} className="rounded-card-lg border border-hairline bg-surface p-5 flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <h3 className="font-heading font-semibold text-[15px] text-ink-1 leading-snug">{a.name}</h3>
              {a.funderCount > 0 && (
                <span className="shrink-0 text-[11px] font-heading font-semibold text-orange bg-orange-light rounded-full px-2 py-0.5">
                  {a.funderCount} {a.funderCount === 1 ? "funder" : "funders"}
                </span>
              )}
            </div>
            {a.hook && <p className="text-[13px] text-ink-2 leading-relaxed mb-2 flex-1">{a.hook}</p>}
            {a.ask && (
              <div className="text-[12px] text-ink-3 pt-2 border-t border-hairline">
                <span className="font-semibold uppercase tracking-[0.1em] text-[10px]">Ask</span> · {a.ask}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Live pipeline by stage. */}
      {pipelineByStage.length > 0 && (
        <div className="rounded-card-lg border border-hairline bg-surface p-5 mb-8">
          <div className="text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3 mb-4">
            Live pipeline by stage
          </div>
          <div className="space-y-3">
            {pipelineByStage.map((s) => (
              <div key={s.stage} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm text-ink-1">{STAGE_LABEL[s.stage] ?? s.stage}</span>
                <div className="flex-1 h-6 rounded-full bg-tile overflow-hidden relative">
                  <div
                    className="h-full bg-orange/60 flex items-center"
                    style={{ width: `${Math.max(8, Math.round((s.count / maxStage) * 100))}%` }}
                  />
                </div>
                <span className="w-32 shrink-0 text-right text-sm tabular-nums text-ink-2">
                  {s.count} · {formatUsd(s.askTotal)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[12px] text-ink-3">
            Counts and ask totals are live from the pipeline; steward is shown for context but is excluded
            from the weighted ask in Movement 2.
          </div>
        </div>
      )}

      {/* Channel progress. */}
      {channels.length > 0 && (
        <div className="rounded-card-lg border border-hairline bg-surface p-5">
          <div className="text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3 mb-3">
            Channel progress
          </div>
          <div className="space-y-1">
            {channels.map((c) => {
              const val = c.unit === "usd" ? formatUsd(c.current) : (c.current ?? 0).toLocaleString("en-US");
              const tgt = c.unit === "usd" ? formatUsd(c.target) : (c.target ?? 0).toLocaleString("en-US");
              return (
                <div
                  key={c.metricKey}
                  className="flex items-baseline justify-between gap-3 py-1.5 border-b border-hairline last:border-0"
                >
                  <span className="text-sm text-ink-1">{c.title}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-heading font-semibold tabular-nums text-ink-1">
                      {val} <span className="text-ink-3 font-normal">/ {tgt}</span>
                    </span>
                    <StatusChip status={c.status}>{STATUS_LABEL[c.status]}</StatusChip>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
