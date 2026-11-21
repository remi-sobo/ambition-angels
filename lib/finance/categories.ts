import type { SupabaseClient } from "@supabase/supabase-js";

// Finance categories are per-org (fin_categories_org_scope.sql): the primary
// key is (org_id, id), so the same text id can exist in two orgs and a
// category id means nothing without its org. Every write that takes a
// category id from a request goes through orgCategoryIds() first, so a
// route rejects another org's (or a made-up) id with a clean 400 instead of
// relying on the composite FK alone. The service-role client bypasses RLS,
// which makes this app-side pin the first line of defence.

/** The subset of `ids` that exist as categories in `orgId`. */
export async function orgCategoryIds(
  supabase: SupabaseClient,
  orgId: string,
  ids: Iterable<string>,
): Promise<Set<string>> {
  const wanted = Array.from(new Set(Array.from(ids).filter((id) => typeof id === "string" && id)));
  if (wanted.length === 0) return new Set();
  const { data, error } = await supabase
    .from("fin_categories")
    .select("id")
    .eq("org_id", orgId)
    .in("id", wanted);
  if (error) throw new Error(`fin_categories lookup failed: ${error.message}`);
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
}

/** True when `id` is a category of `orgId`. */
export async function isOrgCategory(
  supabase: SupabaseClient,
  orgId: string,
  id: string,
): Promise<boolean> {
  return (await orgCategoryIds(supabase, orgId, [id])).has(id);
}

/** Upsert conflict target for fin_budget: one row per (org, year, category). */
export const FIN_BUDGET_CONFLICT = "org_id,year,category_id";

/** Copy for an org that has no finance categories yet. */
export const NO_CATEGORIES_MESSAGE =
  "Your organization doesn't have any finance categories yet. Categories are set up by your BloomOS operator; once they're loaded, budgets, rules and categorization will work here.";
