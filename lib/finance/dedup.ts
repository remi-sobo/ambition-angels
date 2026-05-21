import { createHash } from "crypto";
import type { ParsedTxn } from "./types";

// Per-row dedup hash. The same statement may be re-uploaded with overlapping
// date ranges; we want exactly-once insertion of any given (date, amount,
// description) triple.
//
// Description is uppercased and whitespace-collapsed so cosmetic differences
// (extra spaces, casing) don't generate distinct hashes. Amount is converted
// to integer cents to avoid floating-point representation drift between
// uploads (1234.5 vs 1234.50).
export function dedupHash(t: ParsedTxn): string {
  const amountCents = Math.round(t.amount * 100);
  const normDesc = t.description.toUpperCase().replace(/\s+/g, " ").trim();
  const key = `${t.txn_date}|${amountCents}|${normDesc}`;
  return createHash("sha256").update(key).digest("hex");
}

// Whole-file hash. Used to short-circuit a re-upload of an identical CSV;
// we store this on fin_imports and return the prior import result instead
// of re-processing.
export function fileHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
