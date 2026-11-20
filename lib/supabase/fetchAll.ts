/**
 * Read every row a query matches, past PostgREST's per-response row cap.
 *
 * Supabase's PostgREST answers at most `max_rows` rows per request (1,000 by
 * default) and does it SILENTLY: no error, no flag, just a short array. Any
 * loader that sums, counts or rates a whole table in memory must page with
 * `.range()` or its number is wrong once the org passes 1,000 rows. An explicit
 * `.limit(10000)` does not help; the server still caps it at 1,000.
 *
 * Contract:
 *   - The caller gives a stable sort (`order`, at least one key, ending in a
 *     unique column such as `id`). Without one, Postgres may return pages in a
 *     different order on each request and rows get skipped or doubled.
 *   - Paging stops at the first short page, so a table under `pageSize` costs
 *     exactly one request, the same as the unpaged query it replaces.
 *   - `pageSize` must not exceed the server's `max_rows`, or a capped page
 *     would look short and end the read early. 1,000 is the Supabase default.
 *   - At `hardCap` rows the read stops and returns `truncated: true`, so a
 *     caller can say "at least" instead of showing a capped total as complete.
 *     Never silent.
 *   - On an error the result is `{ data: null, error }`, never a partial set
 *     dressed as complete.
 */

export type OrderKey = string | { column: string; ascending?: boolean };

type PageResponse<T> = { data: T[] | null; error: { message: string } | null };

/** The slice of a PostgREST filter builder this helper drives. */
export interface PageableQuery<T> {
  order(column: string, options?: { ascending?: boolean }): PageableQuery<T>;
  range(from: number, to: number): PromiseLike<PageResponse<T>>;
}

export type FetchAllOptions = {
  /** Stable sort, applied in order. End with a unique column (usually `id`). */
  order: [OrderKey, ...OrderKey[]];
  /** Rows per request. Must be <= the server's max_rows. Default 1,000. */
  pageSize?: number;
  /** Stop after this many rows and report `truncated`. Default 50,000. */
  hardCap?: number;
};

export type FetchAllResult<T> =
  | { data: T[]; error: null; truncated: boolean }
  | { data: null; error: { message: string }; truncated: false };

export const DEFAULT_PAGE_SIZE = 1000;
export const DEFAULT_HARD_CAP = 50_000;

/**
 * @param query builds a fresh, filtered query on each call, without order or
 *              range (the helper adds both). Example:
 *              `() => sb.from("attendance").select("session_id, status").eq("org_id", orgId)`
 */
export async function fetchAll<T>(
  query: () => PageableQuery<T>,
  { order, pageSize = DEFAULT_PAGE_SIZE, hardCap = DEFAULT_HARD_CAP }: FetchAllOptions
): Promise<FetchAllResult<T>> {
  if (!order || order.length === 0) throw new Error("fetchAll: a stable order is required");
  if (pageSize < 1 || hardCap < 1) throw new Error("fetchAll: pageSize and hardCap must be positive");

  const rows: T[] = [];
  for (let from = 0; from < hardCap; from += pageSize) {
    const size = Math.min(pageSize, hardCap - from);
    let q = query();
    for (const key of order) {
      q = typeof key === "string" ? q.order(key, { ascending: true }) : q.order(key.column, { ascending: key.ascending ?? true });
    }
    const { data, error } = await q.range(from, from + size - 1);
    if (error) return { data: null, error, truncated: false };
    const batch = data ?? [];
    for (const r of batch) rows.push(r);
    if (batch.length < size) return { data: rows, error: null, truncated: false };
  }
  // Every page came back full up to the cap: there may be more rows.
  return { data: rows, error: null, truncated: true };
}
