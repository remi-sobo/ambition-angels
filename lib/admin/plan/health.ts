/**
 * Strategy health rollup — pure, shared by the plan page (client), the cockpit
 * source, and the briefing gather layer (server). No React, so it's safe to
 * import anywhere. Management by exception: a parent takes the worst health of
 * its children's KPIs.
 */

// Higher = worse. on_track/done are both "fine"; not_started is "no signal".
export const HEALTH_RANK: Record<string, number> = {
  behind: 3,
  at_risk: 2,
  on_track: 1,
  done: 1,
  not_started: 0,
};

/** Roll a set of KPI statuses up to a single health (worst wins). null = no signal. */
export function deriveHealth(statuses: string[]): string | null {
  if (statuses.some((s) => s === "behind")) return "behind";
  if (statuses.some((s) => s === "at_risk")) return "at_risk";
  if (statuses.some((s) => s === "on_track" || s === "done")) return "on_track";
  return null;
}

/** The worse of two healths (null = no signal, ranks below everything). */
export function worstHealth(a: string | null, b: string | null): string | null {
  const ra = a ? HEALTH_RANK[a] ?? 0 : -1;
  const rb = b ? HEALTH_RANK[b] ?? 0 : -1;
  return ra >= rb ? a : b;
}

export const isOffTrack = (health: string | null): boolean =>
  health === "behind" || health === "at_risk";

/** Human label for a health value (shared by chips, the verdict, the briefing). */
export const HEALTH_LABEL: Record<string, string> = {
  behind: "Behind",
  at_risk: "At risk",
  on_track: "On track",
  done: "Done",
  not_started: "Not started",
};

export const healthLabel = (health: string | null): string =>
  health ? HEALTH_LABEL[health] ?? health : "No signal";
