/**
 * Pure helpers for the donor CSV import's gift path: method normalization for
 * CRM exports (Network for Good, GiveButter, generic spreadsheets), the
 * idempotency key that makes re-running an import a no-op for gifts, and the
 * per-year reconciliation report that lets the operator check imported totals
 * against the source system's prior-year numbers before trusting the spine.
 */

export const GIFT_METHODS = ["card", "cash", "check", "ach", "in_kind", "stock", "other"] as const;
export type GiftMethod = (typeof GIFT_METHODS)[number];

// Common CRM-export spellings → spine methods. Anything unrecognized lands
// "other" rather than failing the row — method is descriptive, not load-bearing.
const METHOD_ALIASES: Record<string, GiftMethod> = {
  card: "card",
  "credit card": "card",
  "credit/debit": "card",
  "debit card": "card",
  credit: "card",
  cc: "card",
  stripe: "card",
  paypal: "card",
  cash: "cash",
  check: "check",
  cheque: "check",
  ach: "ach",
  eft: "ach",
  "bank transfer": "ach",
  "direct debit": "ach",
  wire: "ach",
  "in kind": "in_kind",
  "in-kind": "in_kind",
  in_kind: "in_kind",
  goods: "in_kind",
  stock: "stock",
  securities: "stock",
};

export function normalizeGiftMethod(raw: string): GiftMethod {
  const key = raw.trim().toLowerCase();
  if (!key) return "other";
  return METHOD_ALIASES[key] ?? (GIFT_METHODS.includes(key as GiftMethod) ? (key as GiftMethod) : "other");
}

/**
 * Idempotency key for an imported gift. A re-run of the same file (or an
 * overlapping export) matches on (constituent, date, amount) and is skipped —
 * the same shape the finance import uses for bank lines. Two genuinely
 * distinct same-day same-amount gifts from one donor WILL collapse; the
 * reconciliation report surfaces the skip so the operator can see it.
 */
export function giftDedupeKey(constituentId: string, giftDate: string, amount: number): string {
  return `${constituentId}|${giftDate}|${amount.toFixed(2)}`;
}

export type ReconciliationYear = {
  year: string;
  inserted: number;
  insertedAmount: number;
  duplicates: number;
  duplicateAmount: number;
};

export type Reconciliation = {
  years: ReconciliationYear[];
  inserted: number;
  insertedAmount: number;
  duplicates: number;
  duplicateAmount: number;
};

export function emptyReconciliation(): Reconciliation {
  return { years: [], inserted: 0, insertedAmount: 0, duplicates: 0, duplicateAmount: 0 };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Fold one gift into the report. Mutates and returns `recon` for chaining. */
export function addToReconciliation(
  recon: Reconciliation,
  giftDate: string,
  amount: number,
  outcome: "inserted" | "duplicate"
): Reconciliation {
  const year = giftDate.slice(0, 4);
  let bucket = recon.years.find((y) => y.year === year);
  if (!bucket) {
    bucket = { year, inserted: 0, insertedAmount: 0, duplicates: 0, duplicateAmount: 0 };
    recon.years.push(bucket);
    recon.years.sort((a, b) => (a.year < b.year ? -1 : 1));
  }
  if (outcome === "inserted") {
    bucket.inserted += 1;
    bucket.insertedAmount = round2(bucket.insertedAmount + amount);
    recon.inserted += 1;
    recon.insertedAmount = round2(recon.insertedAmount + amount);
  } else {
    bucket.duplicates += 1;
    bucket.duplicateAmount = round2(bucket.duplicateAmount + amount);
    recon.duplicates += 1;
    recon.duplicateAmount = round2(recon.duplicateAmount + amount);
  }
  return recon;
}

/** Merge b into a (used by the wizard to accumulate per-batch reports). */
export function mergeReconciliation(a: Reconciliation, b: Reconciliation): Reconciliation {
  for (const y of b.years) {
    let bucket = a.years.find((x) => x.year === y.year);
    if (!bucket) {
      bucket = { year: y.year, inserted: 0, insertedAmount: 0, duplicates: 0, duplicateAmount: 0 };
      a.years.push(bucket);
      a.years.sort((x, z) => (x.year < z.year ? -1 : 1));
    }
    bucket.inserted += y.inserted;
    bucket.insertedAmount = round2(bucket.insertedAmount + y.insertedAmount);
    bucket.duplicates += y.duplicates;
    bucket.duplicateAmount = round2(bucket.duplicateAmount + y.duplicateAmount);
  }
  a.inserted += b.inserted;
  a.insertedAmount = round2(a.insertedAmount + b.insertedAmount);
  a.duplicates += b.duplicates;
  a.duplicateAmount = round2(a.duplicateAmount + b.duplicateAmount);
  return a;
}
