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

// ── Briefing engine thresholds (spec Phase 4) ───────────────────────────────
// Every signal source reads its cutoffs from here — never a hardcoded literal —
// so leadership can retune what counts as critical/watch without code changes.

export const FINANCE = {
  /** Months of runway at/below which finance is critical (red). */
  runwayCriticalMonths: 3,
  /** Months of runway at/below which finance is a watch (amber). */
  runwayWatchMonths: 6,
  /** Cash on hand (USD) at/below which we flag a watch regardless of runway. */
  cashFloorUsd: 25_000,
} as const;

export const TASKS = {
  /** Overdue task count at/above which tasks are a watch. */
  overdueWatchCount: 1,
  /** Overdue task count at/above which tasks are critical. */
  overdueCriticalCount: 5,
} as const;

export const COMPLIANCE = {
  /** A compliance item due within this many days is "due soon". Overdue is critical. */
  dueSoonDays: 14,
} as const;

export const MAJOR_GIFTS = {
  /** An open ask holding at least this much (USD) is "real dollars" worth flagging. */
  dollarFloorUsd: 10_000,
  /** Open ask count with an overdue next step at/above which it's critical. */
  overdueStepCriticalCount: 3,
} as const;

export const DONORS = {
  /** Days a gift can await acknowledgment before it's flagged. */
  ackWindowDays: 30,
  /** Gifts at/above this amount need a contemporaneous written receipt (IRS Pub 1771). */
  irsThresholdUsd: 250,
} as const;

export const ENGAGEMENT = {
  /** A past cohort session still missing attendance after this many days is a gap. */
  attendanceGraceDays: 2,
} as const;

export const STRATEGY = {
  /** A monthly OGSM review within this many days of its next date is "due soon". */
  reviewDueSoonDays: 7,
} as const;

export const FOLLOWUPS = {
  /** Hours after a follow-up lands before it's "past the SLA" (the 24-hour rule
   *  for emails from HubSpot contacts that Cowork drops on the board). */
  slaHours: 24,
} as const;

export const MEETINGS = {
  /** Lookback window (days) for the meeting follow-up coverage check. */
  coverageWindowDays: 14,
  /** Uncovered-meeting count at/above which coverage is a watch. */
  gapWatchCount: 1,
  /** Uncovered-meeting count at/above which coverage is critical. */
  gapCriticalCount: 5,
} as const;

export const SNOOZE = {
  /** Default snooze length when an operator defers a briefing item. */
  hours: 24,
} as const;

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
