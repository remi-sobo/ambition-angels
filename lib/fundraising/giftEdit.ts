// Gift edit rules (V4 Stage B1, GiftFlow.dc.html). Pure: the PATCH route, the
// gift drawer and the tests all use these, so the rules cannot drift between
// what the drawer shows and what the server allows.
//
// The rules, in one place:
//  1. Only these fields are editable: amount, gift_date, method, fund,
//     campaign, appeal, fair market value, notes. The donor link, the source
//     and the thank-you status are never changed by an edit.
//  2. A gift that came from a payment or CRM sync (Stripe, Givebutter, a
//     HubSpot deal) keeps its amount, date and method: those would re-sync
//     from the source, so the fix belongs there. Attribution and notes stay
//     editable.
//  3. Every edit is audited with the before and after of the fields that
//     changed (diffGift).
//  4. When a tax receipt already went out for the gift, the drawer says the
//     receipt will not change automatically. Nothing is resent.
//  5. No deletes here.

export const GIFT_METHODS = ["card", "cash", "check", "ach", "in_kind", "stock", "other"] as const;
export type GiftMethod = (typeof GIFT_METHODS)[number];

export const METHOD_LABEL: Record<string, string> = {
  check: "Check",
  card: "Card",
  ach: "Bank",
  cash: "Cash",
  stock: "Stock",
  in_kind: "In-kind",
  other: "Other",
};

/** Sources whose money lives upstream. Same list the DELETE route uses. */
export const SYNCED_SOURCES = ["stripe", "givebutter", "hubspot_deal"] as const;

/** The fields an edit may touch, in display order. */
export const EDITABLE_FIELDS = [
  "amount",
  "gift_date",
  "method",
  "fund_id",
  "campaign_id",
  "appeal_id",
  "fair_market_value",
  "notes",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** Fields that change what a tax receipt says. */
export const RECEIPT_FIELDS: readonly EditableField[] = ["amount", "gift_date", "method", "fair_market_value"];

const LOCKED_WHEN_SYNCED: readonly EditableField[] = ["amount", "gift_date", "method"];

export const FIELD_LABEL: Record<EditableField, string> = {
  amount: "Amount",
  gift_date: "Date",
  method: "Payment method",
  fund_id: "Fund",
  campaign_id: "Campaign",
  appeal_id: "Appeal",
  fair_market_value: "Fair market value",
  notes: "Notes",
};

export function isSyncedSource(source: string | null | undefined): boolean {
  return !!source && (SYNCED_SOURCES as readonly string[]).includes(source);
}

/** The fields this gift's source does not let an edit change. */
export function lockedFields(source: string | null | undefined): EditableField[] {
  return isSyncedSource(source) ? [...LOCKED_WHEN_SYNCED] : [];
}

const isISODate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const money = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;

export type GiftPatch = Partial<Record<EditableField | "deductible_amount", string | number | null>>;

/**
 * Validate a PATCH body into the update the route may write. Unknown or
 * malformed fields are dropped, never guessed. `deductible_amount` follows
 * fair market value (quid pro quo: amount minus FMV, never below zero), using
 * the new amount when one is sent and the current one otherwise.
 */
export function normalizeGiftPatch(body: Record<string, unknown>, currentAmount: number | null): GiftPatch {
  const update: GiftPatch = {};
  const amount = money(body.amount);
  if (amount !== null && amount > 0) update.amount = amount;
  if (isISODate(body.gift_date)) update.gift_date = body.gift_date;
  if ((GIFT_METHODS as readonly string[]).includes(body.method as string)) update.method = body.method as string;
  for (const k of ["fund_id", "campaign_id", "appeal_id"] as const) {
    if (k in body && (isUuid(body[k]) || body[k] === null || body[k] === "")) update[k] = body[k] ? (body[k] as string) : null;
  }
  if ("fair_market_value" in body) {
    const fmv = body.fair_market_value === null || body.fair_market_value === "" ? 0 : money(body.fair_market_value);
    if (fmv !== null) {
      update.fair_market_value = fmv > 0 ? fmv : null;
      const base = (update.amount as number | undefined) ?? currentAmount;
      update.deductible_amount = fmv > 0 && base !== null ? Math.max(0, Math.round((base - fmv) * 100) / 100) : null;
    }
  }
  if (typeof body.notes === "string") update.notes = body.notes.slice(0, 2000) || null;
  return update;
}

type GiftLike = Partial<Record<EditableField | "deductible_amount", unknown>>;

const same = (a: unknown, b: unknown): boolean => {
  const na = a === undefined || a === "" ? null : a;
  const nb = b === undefined || b === "" ? null : b;
  if (typeof na === "number" || typeof nb === "number") {
    if (na === null || nb === null) return na === nb;
    return Number(na) === Number(nb);
  }
  return na === nb;
};

export type GiftDiff = {
  /** Editable fields whose value changes. */
  changed: EditableField[];
  /** Old values of the changed fields (plus deductible_amount when it moves). */
  before: Record<string, unknown>;
  /** New values of the changed fields. */
  after: Record<string, unknown>;
};

/** What an update changes on a gift: the audit log's before/after. */
export function diffGift(before: GiftLike, update: GiftPatch): GiftDiff {
  const out: GiftDiff = { changed: [], before: {}, after: {} };
  for (const f of EDITABLE_FIELDS) {
    if (!(f in update)) continue;
    if (same(before[f], update[f])) continue;
    out.changed.push(f);
    out.before[f] = before[f] ?? null;
    out.after[f] = update[f] ?? null;
  }
  // The deductible part only follows a real change to the amount or the fair
  // market value, so re-sending an unchanged gift never clears it (a Stripe
  // gift carries a deductible amount and no FMV).
  const moves = out.changed.includes("amount") || out.changed.includes("fair_market_value");
  if (moves && "deductible_amount" in update && !same(before.deductible_amount, update.deductible_amount)) {
    out.before.deductible_amount = before.deductible_amount ?? null;
    out.after.deductible_amount = update.deductible_amount ?? null;
  }
  return out;
}

/** The changed fields this gift's source does not allow. Empty = allowed. */
export function lockedViolations(source: string | null | undefined, changed: readonly EditableField[]): EditableField[] {
  const locked = lockedFields(source);
  return changed.filter((f) => locked.includes(f));
}

/**
 * Acknowledgment templates that carried the IRS receipt block: the manual
 * send route ("receipt-v1") and the stewardship auto-send ("auto-receipt").
 */
export const RECEIPT_TEMPLATES = ["receipt-v1", "auto-receipt"] as const;

type AckLike = { template?: string | null; channel?: string | null; sent_at?: string | null };

/**
 * Was a tax receipt already sent for this gift? True when a sent
 * acknowledgment used a receipt template, or was a letter (a letter for a
 * gift carries the printed receipt, as the composer shows).
 */
export function receiptWasSent(acks: readonly AckLike[]): boolean {
  return acks.some(
    (a) => !!a.sent_at && ((RECEIPT_TEMPLATES as readonly string[]).includes(a.template ?? "") || a.channel === "letter"),
  );
}

export type ReceiptNotice = { tone: "info" | "warning"; title: string; body: string } | null;

/**
 * The Notice the drawer shows when editing a gift whose receipt already went
 * out. Warning when the edit changes something the receipt states; info
 * otherwise. Never a resend.
 */
export function receiptEditNotice(receiptSent: boolean, changed: readonly EditableField[]): ReceiptNotice {
  if (!receiptSent) return null;
  const touchesReceipt = changed.some((f) => RECEIPT_FIELDS.includes(f));
  return touchesReceipt
    ? {
        tone: "warning",
        title: "A tax receipt was already sent for this gift.",
        body: "It will not change automatically and nothing is resent. If the donor needs a corrected receipt, send one yourself.",
      }
    : {
        tone: "info",
        title: "A tax receipt was already sent for this gift.",
        body: "Changing the amount, date, method or fair market value will not update it, and nothing is resent.",
      };
}

/** Smart defaults for a new gift (GiftFlow: "Check, like her last gift"). */
export function giftDefaults(opts: { today: string; lastMethod?: string | null }): {
  gift_date: string;
  method: GiftMethod;
  methodHint: string | null;
} {
  const last = (GIFT_METHODS as readonly string[]).includes(opts.lastMethod ?? "") ? (opts.lastMethod as GiftMethod) : null;
  return {
    gift_date: opts.today,
    method: last ?? "check",
    methodHint: last ? `${METHOD_LABEL[last]}, like the last gift` : null,
  };
}

/** Parse the amount box ("25,000", "$1,250.50") into dollars, or null. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? Math.round(n * 100) / 100 : null;
}
