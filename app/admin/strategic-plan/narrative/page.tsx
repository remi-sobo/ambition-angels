import Link from "next/link";
import { getOrgContext } from "@/lib/admin/auth";
import { getPlanMovement, type NarrativeKpi, type NarrativeObjective } from "@/lib/admin/strategy/narrative";
import { StatusChip } from "../../_components/StatusChip";
import type { Status } from "@/lib/admin/status";

/**
 * Strategy Narrative — Movement 1, The Plan (spec: specs/strategy-narrative.md,
 * Phase 2). A login-gated, presentation-grade view Remi pulls up live while
 * talking to a funder. It reads the OGSM straight from the plan_* tables via
 * the Phase 1 read module — nothing here is hardcoded.
 *
 * Three movements, fixed order: (1) The Plan ← this phase, (2) What We Need to
 * Raise, (3) How We Raise It. Movements 2–3 and presenter mode land in later
 * phases; this page renders Movement 1 fully and signposts the rest.
 *
 * Server read on every load (no cache) so a change in the strategy admin shows
 * here on next load — the spec's "stale targets after a reseed" guard.
 */
export const dynamic = "force-dynamic";

// Status → the word a funder reads. One mapping, mirrors the five-value scale.
const STATUS_LABEL: Record<Status, string> = {
  critical: "Behind",
  watch: "At risk",
  due: "Due",
  healthy: "On track",
  neutral: "Not started",
};

// Initiative (strategy) status → status scale, for the small leading dot.
const INITIATIVE_STATUS: Record<string, Status> = {
  done: "healthy",
  in_progress: "due",
  todo: "neutral",
  blocked: "critical",
};

/** Format a KPI value for its unit. Targets/actuals both flow through here. */
function formatValue(unit: string | null, value: number | null): string {
  if (value == null) return "—";
  switch (unit) {
    case "usd":
      return value >= 1000
        ? `$${(value / 1000).toLocaleString("en-US", { maximumFractionDigits: value >= 10000 ? 0 : 1 })}K`.replace("$1,000K", "$1M")
        : `$${value.toLocaleString("en-US")}`;
    case "percent":
      return `${value % 1 === 0 ? value : value.toFixed(1)}%`;
    case "months":
      return `${value % 1 === 0 ? value : value.toFixed(1)} mo`;
    case "boolean":
      return value >= 1 ? "Yes" : "No";
    default:
      return value.toLocaleString("en-US");
  }
}

function MeasureRow({ kpi }: { kpi: NarrativeKpi }) {
  const hasTarget = kpi.target != null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-hairline last:border-0">
      <span className="text-sm text-ink-1">{kpi.title}</span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-heading font-semibold tabular-nums text-ink-1">
          {formatValue(kpi.unit, kpi.current)}
          {hasTarget && (
            <span className="text-ink-3 font-normal"> / {formatValue(kpi.unit, kpi.target)}</span>
          )}
        </span>
        <StatusChip status={kpi.status}>{STATUS_LABEL[kpi.status]}</StatusChip>
      </span>
    </div>
  );
}

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
          {objective.statement && (
            <p className="text-sm text-ink-2 leading-relaxed">{objective.statement}</p>
          )}
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
            {goal.description && (
              <p className="text-[13px] text-ink-2 leading-relaxed mb-3">{goal.description}</p>
            )}

            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {goal.initiatives.length > 0 && (
                <div>
                  <div className="text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3 mb-1.5">
                    Strategies
                  </div>
                  <ul className="space-y-1">
                    {goal.initiatives.map((i) => (
                      <li key={i.id} className="flex items-start gap-2 text-[13px] text-ink-1">
                        <span
                          aria-hidden
                          className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            INITIATIVE_STATUS[i.status] === "healthy"
                              ? "bg-status-healthy"
                              : INITIATIVE_STATUS[i.status] === "due"
                                ? "bg-status-due"
                                : INITIATIVE_STATUS[i.status] === "critical"
                                  ? "bg-status-critical"
                                  : "bg-ink-3"
                          }`}
                        />
                        <span>{i.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {goal.kpis.length > 0 && (
                <div>
                  <div className="text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3 mb-1.5">
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

export default async function StrategyNarrativePage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  }

  const plan = await getPlanMovement(ctx.orgId);
  const empty = plan.objectives.length === 0;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-10 max-w-[920px]">
      {/* Movement nav — fixed order; only Movement 1 is live this phase. */}
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-3 mb-8">
        <span className="text-orange font-semibold">1 · The Plan</span>
        <span aria-hidden>→</span>
        <span>2 · What We Raise</span>
        <span aria-hidden>→</span>
        <span>3 · How We Raise It</span>
        <Link
          href="/admin/strategic-plan"
          className="ml-auto normal-case tracking-normal text-ink-2 hover:text-orange hover:underline"
        >
          ← Strategic Plan
        </Link>
      </div>

      <div className="text-[10px] uppercase tracking-[0.25em] text-orange/80 mb-2">
        Strategy Narrative · Movement 1 of 3
      </div>
      <h1 className="font-display text-5xl sm:text-6xl text-ink-1 leading-[0.95] mb-4">The Plan</h1>

      {/* The frame — mission / vision straight from plan_foundation. */}
      {plan.foundation && (plan.foundation.mission || plan.foundation.vision) && (
        <div className="mb-12 max-w-[680px] space-y-2">
          {plan.foundation.mission && (
            <p className="text-lg text-ink-1 leading-relaxed">{plan.foundation.mission}</p>
          )}
          {plan.foundation.vision && (
            <p className="text-sm text-ink-2 leading-relaxed">{plan.foundation.vision}</p>
          )}
        </div>
      )}

      {empty ? (
        <p className="text-sm text-ink-2">
          No plan to narrate yet. Build the OGSM in the{" "}
          <Link href="/admin/strategic-plan" className="text-orange hover:underline">Strategic Plan</Link>{" "}
          first — this view renders whatever is live.
        </p>
      ) : (
        plan.objectives.map((o, i) => <ObjectiveBlock key={o.id} objective={o} index={i} />)
      )}

      <div className="mt-16 pt-6 border-t border-hairline text-sm text-ink-3">
        Next: <span className="text-ink-2">Movement 2 — What We Need to Raise</span> (the floor, the
        gap, the runway) and <span className="text-ink-2">Movement 3 — How We Raise It</span>. Coming
        in the next phases.
      </div>
    </div>
  );
}
