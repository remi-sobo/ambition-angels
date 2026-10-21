import { addDays } from "@/lib/admin/ops/week";
import { constituentName } from "@/lib/fundraising/display";
import { evaluateStewardship, type StewardshipRule } from "@/lib/fundraising/stewardship";

/**
 * Needs you, named thank-yous (specs/needs-you-popout-thank-yous.md, PR 1).
 * PURE: the Today loader feeds it the pending gifts it loaded (org-fenced);
 * tests feed it fixtures.
 *
 * v_obligations' acknowledgment arm carries only "Thank-you due" and
 * due_date = gift_date, so every gift is overdue the day it lands. This
 * module puts the donor on the row and moves "due" to the stewardship
 * matrix's own SLA, the same arithmetic the ack-task bridge uses
 * (lib/fundraising/ack-tasks.ts buildAckTaskInsert), so the row and its task
 * agree on when the thank-you is due.
 */

/** Fallback SLA when no stewardship rule matches (or the org has none). */
export const ACK_FALLBACK_SLA_HOURS = 48;

export type AckGift = {
  id: string;
  amount: number;
  gift_date: string; // YYYY-MM-DD
  method: string;
  external_source: string | null;
  recurring_plan_id: string | null;
  constituent_id: string | null;
  constituent: {
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
    emails?: string[] | null;
  } | null;
};

export type AckFacts = {
  giftId: string;
  constituentId: string | null;
  donorName: string;
  amount: number;
  giftDate: string;
  /** 1-based position of this gift in the donor's giving history. */
  ordinal: number;
  /** gift_date + the matched rule's SLA (whole days, minimum 1). */
  dueDate: string;
};

/** "Unnamed donor" rather than a blank row; organizations by org name. */
export function ackDonorName(c: AckGift["constituent"]): string {
  if (!c) return "Unnamed donor";
  const name = constituentName(c);
  return name === "Unnamed person" || name === "Unnamed organization" ? "Unnamed donor" : name;
}

/** Due date from the stewardship matrix, evaluated as of the day the gift
 *  landed (age 0), which is when the rule would have fired. */
export function ackDueDate(gift: AckGift, rules: StewardshipRule[], ordinal: number): string {
  const decision = evaluateStewardship(
    {
      amount: gift.amount,
      method: gift.method,
      gift_date: gift.gift_date,
      external_source: gift.external_source,
      recurring: Boolean(gift.recurring_plan_id),
      isFirstGift: ordinal === 1,
      ageDays: 0,
    },
    rules,
  );
  const hours = decision.ruleId ? decision.slaHours : ACK_FALLBACK_SLA_HOURS;
  return addDays(gift.gift_date, Math.max(1, Math.ceil(hours / 24)));
}

/**
 * Position of each gift in its donor's history: count of that donor's gifts
 * dated on or before it (same-day ties broken by id, so two gifts on one day
 * get distinct ordinals).
 */
export function giftOrdinals(
  history: readonly { id: string; constituent_id: string | null; gift_date: string }[],
): Map<string, number> {
  const byDonor = new Map<string, { id: string; gift_date: string }[]>();
  for (const g of history) {
    if (!g.constituent_id) continue;
    const list = byDonor.get(g.constituent_id) ?? [];
    list.push(g);
    byDonor.set(g.constituent_id, list);
  }
  const out = new Map<string, number>();
  for (const list of Array.from(byDonor.values())) {
    list
      .sort((a, b) => (a.gift_date === b.gift_date ? a.id.localeCompare(b.id) : a.gift_date < b.gift_date ? -1 : 1))
      .forEach((g, i) => out.set(g.id, i + 1));
  }
  return out;
}

export function buildAckFacts(
  gifts: readonly AckGift[],
  history: readonly { id: string; constituent_id: string | null; gift_date: string }[],
  rules: StewardshipRule[],
): Map<string, AckFacts> {
  const ordinals = giftOrdinals(history);
  const out = new Map<string, AckFacts>();
  for (const g of gifts) {
    const ordinal = ordinals.get(g.id) ?? 1;
    out.set(g.id, {
      giftId: g.id,
      constituentId: g.constituent_id,
      donorName: ackDonorName(g.constituent),
      amount: g.amount,
      giftDate: g.gift_date,
      ordinal,
      dueDate: ackDueDate(g, rules, ordinal),
    });
  }
  return out;
}

export function ordinalLabel(n: number): string {
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix} gift`;
}

export function ackAmount(amount: number): string {
  const whole = Math.round(amount) === amount;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/** "Jun 26" (adds the year only when it isn't the current one). */
export function ackShortDate(dateISO: string, today: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return dateISO.slice(0, 4) === today.slice(0, 4) ? label : `${label}, ${y}`;
}

/** "Thank Lynne O'Hara · $50,000 · Jun 26 · 6th gift" */
export function ackTitle(f: AckFacts, today: string): string {
  return [
    `Thank ${f.donorName}`,
    ackAmount(f.amount),
    ackShortDate(f.giftDate, today),
    ordinalLabel(f.ordinal),
  ].join(" · ");
}

/**
 * Acknowledgments sort overdue first, then by amount descending, so a $25K
 * gift never sits under a $10 one. Rows of other types keep the positions
 * rankObligations gave them: the acknowledgment rows are re-ordered only
 * among the slots they already hold. (A per-type comparator inside the
 * global sort would not be transitive.)
 */
export function orderAckSlots<T extends { type: string; due_date: string | null; amount?: number }>(
  ranked: readonly T[],
  today: string,
): T[] {
  const slots: number[] = [];
  const acks: T[] = [];
  ranked.forEach((r, i) => {
    if (r.type === "acknowledgment") {
      slots.push(i);
      acks.push(r);
    }
  });
  const overdue = (r: T) => (r.due_date !== null && r.due_date < today ? 0 : 1);
  acks.sort((a, b) => overdue(a) - overdue(b) || (b.amount ?? 0) - (a.amount ?? 0));
  const out = [...ranked];
  slots.forEach((slot, i) => {
    out[slot] = acks[i];
  });
  return out;
}
