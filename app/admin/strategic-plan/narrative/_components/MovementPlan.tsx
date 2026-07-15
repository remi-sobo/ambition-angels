import { StatusChip } from "../../../_components/StatusChip";
import type { PlanMovement, NarrativeObjective } from "@/lib/admin/strategy/narrative";
import { MeasureRow, MovementHeader, STATUS_LABEL, INITIATIVE_STATUS, DOT_BG } from "./shared";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Movement 1 — The Plan. The OGSM tree straight from plan_*: the frame
 * (mission / vision), then the four objectives, each with its 2026 statement,
 * owner, status, and nested goals → strategies (initiatives) + measures (KPIs).
 */

function ObjectiveBlock({ objective, index }: { objective: NarrativeObjective; index: number }) {
  return (
    <section className="mb-12">
      <div className="flex items-start gap-4 mb-4">
        <div className="font-display text-5xl leading-none text-orange/30 tabular-nums shrink-0 w-16">
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-display text-2xl text-ink-1">{objective.title}</h3>
            <StatusChip status={objective.status}>{STATUS_LABEL[objective.status]}</StatusChip>
            {objective.owner && (
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">{objective.owner}</span>
            )}
          </div>
          {objective.statement && <p className="text-sm text-ink-2 leading-relaxed">{objective.statement}</p>}
        </div>
      </div>

      {/* KPIs attached directly to the objective (e.g. the WALL numbers). */}
      {objective.objectiveKpis.length > 0 && (
        <div className="ml-0 sm:ml-20 mb-4 rounded-card bg-tile px-4 py-2">
          {objective.objectiveKpis.map((k) => (
            <MeasureRow key={k.id} kpi={k} />
          ))}
        </div>
      )}

      <div className="ml-0 sm:ml-20 space-y-3">
        {objective.goals.map((goal) => (
          <div key={goal.id} className="rounded-card-lg border border-hairline bg-surface p-5">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h4 className="font-heading font-semibold text-base text-ink-1">{goal.title}</h4>
              <StatusChip status={goal.status}>{STATUS_LABEL[goal.status]}</StatusChip>
            </div>
            {goal.description && <p className="text-[13px] text-ink-2 leading-relaxed mb-3">{goal.description}</p>}

            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {goal.initiatives.length > 0 && (
                <div>
                  <div className={`${TYPE.cardLabel} mb-1.5`}>
                    Strategies
                  </div>
                  <ul className="space-y-1">
                    {goal.initiatives.map((i) => (
                      <li key={i.id} className="flex items-start gap-2 text-[13px] text-ink-1">
                        <span
                          aria-hidden
                          className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${DOT_BG[INITIATIVE_STATUS[i.status] ?? "neutral"]}`}
                        />
                        <span>{i.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {goal.kpis.length > 0 && (
                <div>
                  <div className={`${TYPE.cardLabel} mb-1.5`}>
                    Measures
                  </div>
                  <div>
                    {goal.kpis.map((k) => (
                      <MeasureRow key={k.id} kpi={k} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Shown only until an org sets its own proof points on the Foundation panel.
const FALLBACK_PROOF = [
  { value: "3,500+", label: "teens reached" },
  { value: "87%", label: "Title I schools" },
  { value: "1,100+", label: "program hours" },
  { value: "14%", label: "future-orientation lift (directional)" },
];

export default function MovementPlan({ plan }: { plan: PlanMovement }) {
  const empty = plan.objectives.length === 0;
  const frame = plan.foundation && (plan.foundation.mission || plan.foundation.vision) ? plan.foundation : null;
  const proof = plan.foundation?.proofPoints?.length ? plan.foundation.proofPoints : FALLBACK_PROOF;

  return (
    <div>
      <MovementHeader n={1} title="The Plan" lead={frame?.mission ?? undefined} />
      {frame?.vision && <p className="max-w-[680px] text-sm text-ink-2 leading-relaxed -mt-4 mb-8">{frame.vision}</p>}

      {/* Proof before the ask — what's already true, so a cold funder gets
          "why you" before the forward-looking plan. Editable on the Foundation
          panel (plan_foundation.proof_points); falls back to the headline stats
          when none are set, so a fresh org still reads right. */}
      {proof.length > 0 && (
        <div className="mb-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {proof.map((s) => (
            <div key={s.label} className="rounded-card border border-hairline bg-surface p-4">
              <div className="font-display text-2xl sm:text-3xl leading-none tabular-nums text-orange">{s.value}</div>
              <div className="mt-1 text-[12px] text-ink-2 leading-snug">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {empty ? (
        <p className="text-sm text-ink-2">No plan to narrate yet — build the OGSM in the Strategic Plan first.</p>
      ) : (
        plan.objectives.map((o, i) => <ObjectiveBlock key={o.id} objective={o} index={i} />)
      )}
    </div>
  );
}
