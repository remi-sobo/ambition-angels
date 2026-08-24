/**
 * The loop (spec §8 "comms-6-loop"): what happened after an edition went out,
 * fed back into what gets written next. Everything here is pure and
 * deterministic — no model gets a vote on what a story "did".
 *
 * ── Why attribution works the way it does ───────────────────────────────────
 * The sender records sends and failures, not opens, and open decision 6 says
 * to keep it that way: no pixels in v1. The number that matters is money, and
 * that one we can get honestly — `email_sends` records WHO received the
 * campaign (constituent_id), and `gifts` records who gave and when. A gift is
 * attributed to the edition when its donor received the send and gave within
 * ATTRIBUTION_WINDOW_DAYS afterwards.
 *
 * That is a claim about correlation, and the UI says so ("gave within 30 days
 * of receiving it") rather than pretending to know why anyone gave.
 */

export const ATTRIBUTION_WINDOW_DAYS = 30;

export type AttributableGift = {
  constituent_id: string | null;
  amount: number;
  gift_date: string; // ISO date
};

export type GiftAttribution = {
  count: number;
  total: number;
  windowDays: number;
};

/**
 * Gifts from recipients of the send, given on or after the send date and
 * inside the window. Anonymous gifts (no constituent) never attribute — we
 * cannot know they received anything.
 */
export function attributeGifts(
  gifts: readonly AttributableGift[],
  recipientIds: ReadonlySet<string>,
  sentAtISO: string,
  windowDays: number = ATTRIBUTION_WINDOW_DAYS,
): GiftAttribution {
  const sentOn = sentAtISO.slice(0, 10);
  const end = addDays(sentOn, windowDays);
  let count = 0;
  let total = 0;
  for (const g of gifts) {
    if (!g.constituent_id || !recipientIds.has(g.constituent_id)) continue;
    if (g.gift_date < sentOn || g.gift_date > end) continue;
    count += 1;
    total += g.amount;
  }
  return { count, total, windowDays };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type EditionPerformance = {
  /** From the campaign row itself. */
  sent: number;
  failed: number;
  /** Null when the caller can't read the fundraising tables (RLS). */
  gifts: GiftAttribution | null;
  /** Titles of the stories that rode in this edition, format order. */
  storyTitles: string[];
  /** True while the attribution window is still open. */
  windowOpen: boolean;
};

/** One sentence for the panel header; worst true thing first, house style. */
export function performanceVerdict(p: EditionPerformance): string {
  if (p.sent === 0 && p.failed > 0) return "This send failed — nobody received it.";
  const parts: string[] = [];
  parts.push(p.sent === 1 ? "Reached 1 person." : `Reached ${p.sent.toLocaleString("en-US")} people.`);
  if (p.failed > 0) {
    parts.push(p.failed === 1 ? "1 address failed." : `${p.failed.toLocaleString("en-US")} addresses failed.`);
  }
  if (p.gifts) {
    if (p.gifts.count > 0) {
      parts.push(
        `${p.gifts.count === 1 ? "1 recipient" : `${p.gifts.count} recipients`} gave $${Math.round(
          p.gifts.total,
        ).toLocaleString("en-US")} within ${p.gifts.windowDays} days.`,
      );
    } else if (p.windowOpen) {
      parts.push("No gifts from recipients yet — the window is still open.");
    } else {
      parts.push(`No gifts from recipients within ${p.gifts.windowDays} days.`);
    }
  }
  return parts.join(" ");
}

// ── The lead-story style note ───────────────────────────────────────────────

export type LeadStory = {
  title: string;
  tags: string[];
};

type TaggedBankStory = {
  tags?: string[] | null;
  status: string;
  publishable: boolean;
};

/**
 * The verdict line's learned sentence: what the last edition led with, and
 * whether the bank holds more of the same. "Style" is the lead story's tags —
 * the only vocabulary the org itself maintains — never a model's opinion.
 *
 * Returns null when there is nothing worth saying: no sent edition yet, or a
 * lead with no tags (a sentence naming a title teaches nothing).
 */
export function leadStyleNote(
  lead: LeadStory | null,
  bank: readonly TaggedBankStory[],
): string | null {
  if (!lead) return null;
  const tags = (lead.tags ?? []).filter((t) => t.trim().length > 0);
  if (tags.length === 0) return null;
  const tag = tags[0];
  const more = bank.filter(
    (s) => s.publishable && s.status !== "used" && (s.tags ?? []).includes(tag),
  ).length;
  if (more === 0) {
    return `Your last edition led with a “${tag}” story — nothing like it is ready for the next one.`;
  }
  return more === 1
    ? `Your last edition led with a “${tag}” story; 1 more like it is ready.`
    : `Your last edition led with a “${tag}” story; ${more} more like it are ready.`;
}
