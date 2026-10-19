/**
 * Read every row of a query, a page at a time.
 *
 * PostgREST caps each response at the project's max-rows (1,000 on
 * Supabase) and says nothing when it truncates, so an org-wide read of a
 * table that grows per session or per mark (attendance) quietly returns only
 * the first page. Pass a function that applies `.range(from, to)` to a fresh
 * query with a stable order; pages are read until one comes back short.
 *
 *   const marks = await fetchAll((from, to) =>
 *     supabase.from("attendance").select("session_id, status").eq("org_id", orgId)
 *       .order("recorded_at").order("id").range(from, to));
 */
export const PAGE_SIZE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxPages = 50,
): Promise<{ data: T[]; error: unknown }> {
  const out: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(i * PAGE_SIZE, i * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: out, error: null };
}
