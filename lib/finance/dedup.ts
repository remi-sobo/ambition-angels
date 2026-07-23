import { createHash } from "crypto";
import type { ParsedTxn } from "./types";

// Per-row dedup hash. The same statement may be re-uploaded with overlapping
// date ranges; we want exactly-once insertion of any given (date, amount,
// description, occurrence) tuple.
//
// The occurrence index disambiguates legitimate same-content duplicates
// within a single statement: e.g. two $6.81 OpenAI charges on the same
// day are two separate transactions, not one duplicate of the other. They
// each get a unique hash (occurrence 0 and 1) so the per-org UNIQUE index on
// fin_transactions (org_id, dedup_hash) doesn't collapse them. Cross-file dedup
// still works: re-uploading the same batch produces the same hashes (same
// (date, amount, desc) tuples appear in the same order within their group,
// so each gets the same occurrence index it had last time).
//
// Description is uppercased and whitespace-collapsed so cosmetic differences
// (extra spaces, casing) don't generate distinct hashes. Amount is converted
// to integer cents to avoid floating-point representation drift between
// uploads (1234.5 vs 1234.50).
export function dedupHash(t: ParsedTxn, occurrence: number): string {
  const amountCents = Math.round(t.amount * 100);
  const normDesc = t.description.toUpperCase().replace(/\s+/g, " ").trim();
  const key = `${t.txn_date}|${amountCents}|${normDesc}|${occurrence}`;
  return createHash("sha256").update(key).digest("hex");
}

// Compute hashes for a whole batch in one pass, auto-assigning occurrence
// indices per (date, amount, description) group. The order of identical
// rows within their group is preserved from the input — which is the file
// order from the bank export. Bank exports are stable for a given account
// and date range, so re-uploads land each row at the same occurrence index
// it had before, and cross-file dedup continues to work.
export function batchDedupHashes(rows: ParsedTxn[]): string[] {
  const counters = new Map<string, number>();
  return rows.map((r) => {
    const amountCents = Math.round(r.amount * 100);
    const normDesc = r.description.toUpperCase().replace(/\s+/g, " ").trim();
    const groupKey = `${r.txn_date}|${amountCents}|${normDesc}`;
    const occ = counters.get(groupKey) ?? 0;
    counters.set(groupKey, occ + 1);
    return dedupHash(r, occ);
  });
}

// Whole-file hash. Used to short-circuit a re-upload of an identical CSV;
// we store this on fin_imports and return the prior import result instead
// of re-processing.
export function fileHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
