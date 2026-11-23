import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetchAll";

/**
 * The org's uncategorized transactions, summarized: how many, how much money
 * moves through them, and the oldest date. Feeds the "Needs you" row on the
 * Finance dashboard and the Transactions summary strip. Pinned to `orgId`
 * (the service-role client bypasses RLS).
 *
 * `error` is set when the read failed, so a screen shows "No data yet" rather
 * than a confident zero.
 */
export type UncategorizedSummary = {
  count: number;
  /** Sum of absolute amounts (money in and out alike). */
  total: number;
  oldest: string | null;
  error: string | null;
};

export async function loadUncategorized(supabase: SupabaseClient, orgId: string): Promise<UncategorizedSummary> {
  const res = await fetchAll<{ amount: number; txn_date: string }>(
    () => supabase.from("fin_transactions").select("amount, txn_date").eq("org_id", orgId).is("category_id", null),
    { order: ["id"] },
  );
  if (res.error) return { count: 0, total: 0, oldest: null, error: res.error.message };
  return summarizeUncategorized(res.data ?? []);
}

/** PURE: the summary from rows. */
export function summarizeUncategorized(rows: Array<{ amount: number | string; txn_date: string }>): UncategorizedSummary {
  let total = 0;
  let oldest: string | null = null;
  for (const r of rows) {
    total += Math.abs(Number(r.amount) || 0);
    if (!oldest || r.txn_date < oldest) oldest = r.txn_date;
  }
  return { count: rows.length, total, oldest, error: null };
}
