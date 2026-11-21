/**
 * Bulk categorize (V4 Stage G2): the Transactions list's "Categorize as…"
 * bulk action. PURE: the body rules live here so the route and the tests read
 * the same contract.
 *
 *   POST /api/admin/finance/transactions/bulk
 *   { ids: ["<uuid>", ...], category_id: "<one of THIS org's category ids>" | null }
 *
 * Rules (the route enforces them in this order):
 *  1. finance.write, in the active org (requirePermission) — else 401/403;
 *  2. 1 to MAX_BULK_CATEGORIZE distinct transaction uuids — else 400;
 *  3. category_id is a string of this org's fin_categories (keyed by
 *     (org_id, id), #590) or null to clear — another org's or a made-up id
 *     is a 400 and nothing is written;
 *  4. the update is pinned to the active org: ids from another org match
 *     nothing and are counted as skipped, never written;
 *  5. no optimistic update on the client (money rule in lib/admin/saveAction).
 */

export const MAX_BULK_CATEGORIZE = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BulkCategorizeBody = { ids: string[]; categoryId: string | null };

export function parseBulkCategorizeBody(
  raw: unknown,
): { ok: true; body: BulkCategorizeBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Invalid JSON body" };
  const o = raw as Record<string, unknown>;
  const ids = Array.isArray(o.ids)
    ? Array.from(new Set(o.ids.filter((v): v is string => typeof v === "string" && UUID.test(v))))
    : [];
  if (ids.length === 0) return { ok: false, error: "Pick at least one transaction." };
  if (ids.length > MAX_BULK_CATEGORIZE) {
    return { ok: false, error: `Categorize up to ${MAX_BULK_CATEGORIZE} at a time.` };
  }
  if (!("category_id" in o)) return { ok: false, error: "Pick a category." };
  const c = o.category_id;
  if (c === null || c === "") return { ok: true, body: { ids, categoryId: null } };
  if (typeof c !== "string" || c.length > 100) return { ok: false, error: "Invalid category_id" };
  return { ok: true, body: { ids, categoryId: c } };
}

/** The toast after a bulk categorize. */
export function bulkCategorizeMessage(updated: number, skipped: number, label: string | null): string {
  const what = `${updated} transaction${updated === 1 ? "" : "s"}`;
  const head = label ? `${what} set to ${label}.` : `${what} set back to uncategorized.`;
  return skipped > 0 ? `${head} ${skipped} could not be found and were left alone.` : head;
}
