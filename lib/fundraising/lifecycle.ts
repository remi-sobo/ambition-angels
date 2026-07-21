// Donor lifecycle stage (specs/donor-lifecycle-journeys.md + Amendment 1).
// Derived at read time from giving data — never stored, so it can't rot or
// drift. One shared derivation for every constituent in every org; thresholds
// are shared defaults (per-org tuning is an open decision, routed to org
// config later, not built here).
//
// Future stage-transition journey triggers (named here per the spec's open
// decision 4, built in the Epic I Phase 6 journey engine retrofit, not now):
// `became_recurring` (stage enters 'recurring') and `crossed_major` (stage
// enters 'major').

/** $10k+ lifetime giving marks a major donor (derived segment, not a tag). */
export const MAJOR_DONOR_THRESHOLD = 10000;

export const LIFECYCLE_STAGES = [
  "prospect",
  "first_time",
  "repeat",
  "recurring",
  "major",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const LIFECYCLE_LABELS: Record<LifecycleStage, string> = {
  prospect: "Prospect",
  first_time: "First-time",
  repeat: "Repeat",
  recurring: "Recurring",
  major: "Major",
};

export const LIFECYCLE_HELP: Record<LifecycleStage, string> = {
  prospect: "No gifts yet",
  first_time: "Exactly one gift",
  repeat: "Two or more gifts",
  recurring: "Active recurring plan",
  major: `$${MAJOR_DONOR_THRESHOLD.toLocaleString("en-US")}+ lifetime giving`,
};

export type LifecycleInputs = {
  /** Total number of gifts, over the donor's FULL history (never a capped sample). */
  giftCount: number;
  /** Sum of all gift amounts, full history. */
  lifetimeAmount: number;
  /** Whether the donor has a recurring plan with status 'active' right now. */
  hasActiveRecurringPlan: boolean;
};

/**
 * Derive a donor's lifecycle stage from giving data.
 * Precedence: major > recurring > repeat > first_time > prospect.
 * Lapsed is NOT a stage — retention flags (lib/fundraising/retention.ts) own
 * lapse detection and overlay the stage in the UI.
 */
export function deriveLifecycleStage({
  giftCount,
  lifetimeAmount,
  hasActiveRecurringPlan,
}: LifecycleInputs): LifecycleStage {
  if (lifetimeAmount >= MAJOR_DONOR_THRESHOLD) return "major";
  if (hasActiveRecurringPlan) return "recurring";
  if (giftCount >= 2) return "repeat";
  if (giftCount === 1) return "first_time";
  return "prospect";
}
