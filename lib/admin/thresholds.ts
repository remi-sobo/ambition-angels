/**
 * BloomOS operating thresholds — the single, plain-English place where the
 * numbers that drive product behavior live, so leadership can read and change
 * them without hunting through code (spec: "Thresholds are leadership
 * decisions, not code decisions").
 *
 * Phase 2 seeds this with the data-age thresholds. The Phase 4 briefing engine
 * extends it (low-runway, no-touch days, compliance window, critical-vs-watch,
 * stale-spine) — every signal source reads its cutoffs from here, never from a
 * hardcoded literal.
 */

export const DATA_AGE = {
  /**
   * Days since the last *full successful* HubSpot sync before the spine is
   * flagged amber ("getting stale — re-sync soon").
   */
  watchAfterDays: 3,
  /**
   * Days since the last full sync before the spine is flagged red ("do not
   * trust these numbers without re-syncing"). Past this, anything the briefing
   * computes off the spine is demoted/flagged, and the stale spine itself
   * becomes the top briefing item (Phase 4).
   */
  staleAfterDays: 7,
} as const;
