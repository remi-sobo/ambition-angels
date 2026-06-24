/**
 * Measure freshness — pure, client-safe (no server imports), so the plan tree
 * (a client component) and server surfaces can share one staleness rule.
 *
 * A measure you can't date is a measure you don't trust: a manual measure goes
 * "stale" once it's older than its cadence (defaulting to ~6 weeks when no
 * cadence is set). Auto measures refresh from the spine, so they rarely stale.
 */

const CADENCE_DAYS: Record<string, number> = {
  weekly: 8,
  biweekly: 15,
  monthly: 31,
  quarterly: 92,
  annually: 370,
  annual: 370,
  yearly: 370,
};

/** Days before a measure on this cadence is considered stale. */
export function stalenessDays(cadence: string | null | undefined): number {
  const key = cadence?.trim().toLowerCase();
  return (key && CADENCE_DAYS[key]) || 45;
}

export type Freshness = { text: string; stale: boolean };

/** "updated 12d ago" + whether that's past the cadence. */
export function measureFreshness(
  lastUpdatedAt: string | null | undefined,
  cadence: string | null | undefined,
): Freshness {
  if (!lastUpdatedAt) return { text: "never updated", stale: true };
  const days = Math.floor((Date.now() - Date.parse(lastUpdatedAt)) / 86_400_000);
  const text =
    days <= 0 ? "updated today" : days === 1 ? "updated 1d ago" : days < 30 ? `updated ${days}d ago` : `updated ${Math.round(days / 30)}mo ago`;
  return { text, stale: days > stalenessDays(cadence) };
}
