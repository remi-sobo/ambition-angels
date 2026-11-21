/**
 * The story bank's reading order and its verdict line (spec §7.2).
 *
 * Pure, so the sentence at the top of the page and the order of the cards
 * beneath it are both testable and can't drift from each other.
 */

import type { Status } from "@/lib/admin/status";
import { daysBetween, todayISO, type ConsentState } from "./consent";

export type BankStory = {
  id: string;
  title: string;
  status: string;
  rank_order: number | null;
  happened_on: string | null;
  created_at: string;
  consent_state: ConsentState | null;
  publishable: boolean;
  blocked_reason: string | null;
  suggestion_score?: number | null;
  tags?: string[] | null;
};

/**
 * Sort the bank the way it reads.
 *
 * Human rank ALWAYS wins. Ranked cards come first in the order someone dragged
 * them; everything else falls below a hairline ordered by the computed score.
 * The spec calls out the failure mode this protects against — if the machine's
 * order is too confident, people stop curating and the bank becomes a feed.
 */
export function sortBank(stories: readonly BankStory[]): BankStory[] {
  return [...stories].sort((a, b) => {
    const ar = a.rank_order;
    const br = b.rank_order;
    if (ar != null && br != null) return ar - br;
    if (ar != null) return -1;
    if (br != null) return 1;
    const as = a.suggestion_score ?? 0;
    const bs = b.suggestion_score ?? 0;
    if (as !== bs) return bs - as;
    // Stable tail: newest capture first, then id so the order never flickers.
    return a.created_at === b.created_at
      ? a.id.localeCompare(b.id)
      : b.created_at.localeCompare(a.created_at);
  });
}

/** Ranked cards, then the "suggested" remainder — the two groups the UI draws
 *  either side of a hairline. */
export function splitBank(stories: readonly BankStory[]): {
  ranked: BankStory[];
  suggested: BankStory[];
} {
  const sorted = sortBank(stories);
  return {
    ranked: sorted.filter((s) => s.rank_order != null),
    suggested: sorted.filter((s) => s.rank_order == null),
  };
}

/** Consent state → the shared five-value status scale, so a colour means the
 *  same thing here as everywhere else in the admin. */
export function consentStatus(state: ConsentState | null): Status {
  switch (state) {
    case null:
      return "neutral"; // nobody to protect — a story about the org itself
    case "current":
      return "healthy";
    case "expiring":
    case "pending":
      return "watch";
    case "expired":
    case "revoked":
    case "none":
      return "critical";
    default:
      return "neutral";
  }
}

export const CONSENT_LABEL: Record<string, string> = {
  current: "Consented",
  expiring: "Renew soon",
  pending: "Waiting on consent",
  expired: "Consent expired",
  revoked: "Consent revoked",
  none: "No consent",
};

/** "6 weeks", "3 days", "today" — for the verdict line's age phrasing. */
export function humanAge(fromISO: string, today: string = todayISO()): string {
  const days = daysBetween(fromISO, today);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

/**
 * The verdict line: one sentence, worst true thing first, then the list.
 *
 * Deterministic — no model anywhere near it. It exists so the ED opening the
 * bank learns the state of their material before reading a single card, and so
 * "management by exception" has something to point at.
 */
export function bankVerdict(
  stories: readonly BankStory[],
  today: string = todayISO(),
  /** The learned sentence from leadStyleNote(); appended verbatim when set. */
  leadNote: string | null = null,
): string {
  if (stories.length === 0) {
    return "Wins evaporate. Capture one now — rough is fine.";
  }

  const parts: string[] = [];
  const ready = stories.filter((s) => s.publishable);
  const blocked = stories.filter(
    (s) => !s.publishable && s.consent_state != null && s.consent_state !== "current",
  );
  const consentBlocked = blocked.filter((s) =>
    ["none", "pending", "expired", "revoked"].includes(s.consent_state as string),
  );
  const expiring = stories.filter((s) => s.consent_state === "expiring");
  const awaitingApproval = stories.filter(
    (s) => s.status === "raw" || s.status === "drafted",
  );

  parts.push(
    ready.length === 1 ? "1 story ready to use." : `${ready.length} stories ready to use.`,
  );

  // Worst true thing next. Consent blocks outrank everything else — they are
  // the ones that cannot be fixed by the person reading this sentence.
  if (consentBlocked.length > 0) {
    parts.push(
      consentBlocked.length === 1
        ? "1 needs consent before you can use it."
        : `${consentBlocked.length} need consent before you can use them.`,
    );
  } else if (expiring.length > 0) {
    parts.push(
      expiring.length === 1
        ? "1 consent expires within the month."
        : `${expiring.length} consents expire within the month.`,
    );
  } else if (awaitingApproval.length > 0) {
    parts.push(
      awaitingApproval.length === 1
        ? "1 is still waiting on your approval."
        : `${awaitingApproval.length} are still waiting on your approval.`,
    );
  }

  // The nudge: the best material that hasn't been used, and how stale it is
  // getting. Only worth saying when it's actually aging.
  const unused = ready
    .filter((s) => s.status !== "used")
    .filter((s) => s.happened_on)
    .sort((a, b) => (b.suggestion_score ?? 0) - (a.suggestion_score ?? 0));
  const best = unused[0];
  if (best?.happened_on) {
    const age = daysBetween(best.happened_on, today);
    if (age >= 14) {
      parts.push(`Your best unused story is ${humanAge(best.happened_on, today)} old.`);
    }
  }

  if (leadNote) parts.push(leadNote);

  return parts.join(" ");
}
