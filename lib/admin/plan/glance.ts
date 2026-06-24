/**
 * Strategy glance — the executive's three-second read, assembled deterministically
 * from the rollup (no AI). Two outputs:
 *
 *  - `verdict`: one plain-language sentence (the count, then the worst exception).
 *  - `exceptions`: the "Needs attention" list (off-track objectives + an overdue
 *    OGSM review), each linking into the plan.
 *
 * The template grammar is pinned in specs/bloomos-strategy-command-center.md and
 * mirrored here: every clause traces to a rollup field, and any clause whose data
 * is missing is dropped rather than guessed — the line never hedges or invents.
 */
import { cache } from "react";
import {
  getStrategyRollup,
  type StrategyObjectiveTile,
  type StrategyHeadlineKpi,
} from "@/lib/admin/overview/sources";
import { isOffTrack, HEALTH_RANK, healthLabel } from "@/lib/admin/plan/health";
import { planHealthToStatus, type Status } from "@/lib/admin/status";

export type StrategyException = {
  id: string;
  title: string;
  detail: string;
  chip: Status;
  chipLabel: string;
  owner: string | null;
  href: string;
};

export type StrategyGlanceData = {
  hasPlan: boolean;
  objectives: StrategyObjectiveTile[];
  verdict: string;
  exceptions: StrategyException[];
};

const usdShort = (n: number): string =>
  Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n).toLocaleString()}`;

/** The "{measure} is X short / at A of B" clause, phrased by the measure's unit. */
export function measureClause(k: StrategyHeadlineKpi): string {
  if (k.unit === "$") return `${k.title} is ${usdShort(Math.max(0, k.target - k.current))} short`;
  if (k.unit === "%") return `${k.title} at ${Math.round(k.current)}% vs ${Math.round(k.target)}%`;
  return `${k.title} at ${k.current.toLocaleString()} of ${k.target.toLocaleString()}`;
}

const worstMeasure = (o: StrategyObjectiveTile): StrategyHeadlineKpi | null =>
  o.measures.find((m) => isOffTrack(m.status)) ?? o.measures[0] ?? null;

/** Off-track objectives, worst health first, then most measures off target. */
const offTrackObjectives = (objectives: StrategyObjectiveTile[]): StrategyObjectiveTile[] =>
  objectives
    .filter((o) => isOffTrack(o.health))
    .sort(
      (a, b) =>
        (HEALTH_RANK[b.health] ?? 0) - (HEALTH_RANK[a.health] ?? 0) || b.kpisOffTrack - a.kpisOffTrack,
    );

/** Clause 1 (the count) + clause 2 (the worst exception, dropped when none). */
export function buildVerdict(objectives: StrategyObjectiveTile[]): string {
  const total = objectives.length;
  const onTrack = objectives.filter((o) => o.health === "on_track" || o.health === "done").length;
  let verdict = `${onTrack} of ${total} objective${total === 1 ? "" : "s"} on track.`;

  const worst = offTrackObjectives(objectives)[0];
  if (worst) {
    const word = worst.health === "behind" ? "behind" : "at risk";
    const m = worstMeasure(worst);
    verdict += ` ${worst.title} is ${word}${m ? `: ${measureClause(m)}` : ""}.`;
  }
  return verdict;
}

/** Only surface a review when it's due today or overdue (not "in 5 days"). */
function reviewException(nextReviewAt: string | null): StrategyException | null {
  if (!nextReviewAt) return null;
  const days = Math.floor((Date.parse(`${nextReviewAt}T00:00:00Z`) - Date.now()) / 86_400_000);
  if (days > 0) return null;
  return {
    id: "review",
    title: "OGSM review",
    detail: days < 0 ? `Monthly review overdue by ${Math.abs(days)}d` : "Monthly review due today",
    chip: "watch",
    chipLabel: "Review",
    owner: null,
    href: "/admin/strategic-plan/review",
  };
}

export function buildExceptions(
  objectives: StrategyObjectiveTile[],
  nextReviewAt: string | null,
): StrategyException[] {
  const rows: StrategyException[] = offTrackObjectives(objectives).map((o) => {
    const m = worstMeasure(o);
    const detail = m
      ? measureClause(m)
      : o.kpisOffTrack > 0
        ? `${o.kpisOffTrack} measure${o.kpisOffTrack === 1 ? "" : "s"} off target`
        : "Marked off track";
    return {
      id: `obj-${o.id}`,
      title: o.title,
      detail,
      chip: planHealthToStatus(o.health),
      chipLabel: healthLabel(o.health),
      owner: o.owner,
      href: `/admin/strategic-plan/objective/${o.id}`,
    };
  });

  const review = reviewException(nextReviewAt);
  if (review) rows.push(review);
  return rows;
}

export const getStrategyGlance = cache(async (): Promise<StrategyGlanceData> => {
  const rollup = await getStrategyRollup();
  if (!rollup.hasPlan) return { hasPlan: false, objectives: [], verdict: "", exceptions: [] };
  return {
    hasPlan: true,
    objectives: rollup.objectives,
    verdict: buildVerdict(rollup.objectives),
    exceptions: buildExceptions(rollup.objectives, rollup.nextReviewAt),
  };
});
