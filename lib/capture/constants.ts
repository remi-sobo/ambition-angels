/**
 * Capture (specs/bloomos-capture.md) tuning constants. Named here so the
 * matcher hold rules and route limits are one edit, and so tests can cite
 * them instead of magic numbers.
 */

/** Model confidence below this holds the card for a human pick (ruling 2). */
export const MATCH_CONFIDENCE_MIN = 0.75;

/** Two candidates for the same spoken span within this similarity delta, and
 *  neither is the context entity, hold the card ("Which Kendra?"). */
export const NEAR_TIE_DELTA = 0.1;

/** Cards per capture the validator keeps; the rest are dropped with a reason. */
export const MAX_CARDS = 15;

/** Name spans extracted from one transcript. */
export const MAX_SPANS = 12;

/** Candidates the match RPC returns per span. */
export const CANDIDATES_PER_SPAN = 5;

/** Similarity floor the context entity (the page Record was tapped on) is injected at. */
export const CONTEXT_PRIOR_SIM = 0.95;

/** Transcript bounds on the parse route (after trim). */
export const MIN_TRANSCRIPT_CHARS = 1;
export const MAX_TRANSCRIPT_CHARS = 20_000;

/** Per-user parses per rolling hour (ruling 6). Counted from the caller's own captures rows. */
export const CAPTURE_RATE_LIMIT_PER_HOUR = 30;

/** Due / occurred dates must fall inside this window around today, else they are nulled. */
export const DATE_PAST_DAYS = 30;
export const DATE_FUTURE_DAYS = 365;

/** ai_calls.surface for every parse. */
export const CAPTURE_SURFACE = "capture";

/** Output budget for the structured call. */
export const CAPTURE_MAX_OUTPUT_TOKENS = 2000;

/** Timezone relative dates resolve in until org settings carry one. */
export const CAPTURE_DEFAULT_TZ = "America/Los_Angeles";
