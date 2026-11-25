import type { TransportFailure } from "./transport/types";

/**
 * Pure rules for the send queue (specs/comms-v2-gmail-amendment.md G2), kept
 * apart from I/O so they're unit-tested.
 */

/** Per-run pacing. Gmail: 2 at a time with a short gap, as in the Team
 *  Esface engine, well under Google's per-account rate limit. */
export const PACE = {
  gmail: { concurrency: 2, gapMs: 250, batch: 20 },
  resend: { concurrency: 10, gapMs: 0, batch: 100 },
} as const;

/** The worker stops starting new sends after this, inside a 60 s function. */
export const WORKER_BUDGET_MS = 50_000;

/** The daily cap spreads a big send over days; this is the most one email
 *  may be queued for at all. */
export const MAX_RECIPIENTS = 5000;

/** What a failed send becomes in email_sends, and whether the org's run stops. */
export function outcomeFor(failure: TransportFailure): {
  status: "pending" | "failed" | "unknown";
  stopOrg: boolean;
} {
  switch (failure) {
    // The sender is broken or limited: this message did not go. Put it back
    // in the queue and stop this org until the next tick.
    case "auth":
    case "paused":
      return { status: "pending", stopOrg: true };
    case "rejected":
      return { status: "failed", stopOrg: false };
    case "unknown":
      return { status: "unknown", stopOrg: false };
  }
}

/**
 * How a campaign of `total` will spread over days, given what's left of
 * today's cap. Used for the "the last 12 go tomorrow" line before sending.
 */
export function spreadOverDays(total: number, remainingToday: number, dailyCap: number) {
  const today = Math.max(0, Math.min(total, remainingToday));
  const rest = total - today;
  const extraDays = rest > 0 && dailyCap > 0 ? Math.ceil(rest / dailyCap) : 0;
  return { today, rest, extraDays };
}

export function spreadMessage(total: number, remainingToday: number, dailyCap: number): string | null {
  const { today, rest, extraDays } = spreadOverDays(total, remainingToday, dailyCap);
  if (rest === 0) return null;
  const when = extraDays === 1 ? "over the next day" : `over the next ${extraDays} days`;
  return today === 0
    ? `Today's ${dailyCap} sends are used up, so these start when the cap resets and go ${when}.`
    : `${today} go today. At your daily limit of ${dailyCap}, the other ${rest} go ${when}.`;
}

/** A schedule time must be a real future instant, within 90 days. */
export function parseScheduleAt(value: unknown, now = Date.now()): { at: Date | null; error?: string } {
  if (value === undefined || value === null || value === "") return { at: null };
  if (typeof value !== "string") return { at: null, error: "scheduled_at must be an ISO date-time" };
  const t = Date.parse(value);
  if (Number.isNaN(t)) return { at: null, error: "scheduled_at must be an ISO date-time" };
  if (t < now + 60_000) return { at: null, error: "Pick a time at least a minute from now." };
  if (t > now + 90 * 86_400_000) return { at: null, error: "Schedule within the next 90 days." };
  return { at: new Date(t) };
}
