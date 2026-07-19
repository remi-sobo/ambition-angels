import type { SupabaseClient } from "@supabase/supabase-js";

export type CategoryRule = {
  id: string;
  pattern: string;
  pattern_type: "contains" | "starts_with" | "regex";
  category_id: string;
  restricted: boolean;
  priority: number;
  enabled: boolean;
};

// Returns the matching rule for a given description, or null. Rules are
// expected pre-sorted by (priority DESC) — first match wins. Patterns are
// case-insensitive across all three pattern_types.
export function matchRule(
  description: string,
  rules: CategoryRule[]
): CategoryRule | null {
  const upper = description.toUpperCase();
  for (const r of rules) {
    if (!r.enabled) continue;
    const p = r.pattern.toUpperCase();
    if (r.pattern_type === "contains") {
      if (upper.includes(p)) return r;
    } else if (r.pattern_type === "starts_with") {
      if (upper.startsWith(p)) return r;
    } else {
      // regex — case-insensitive. Bad patterns are silently skipped so a
      // single broken rule doesn't poison the whole import.
      try {
        if (new RegExp(r.pattern, "i").test(description)) return r;
      } catch {
        continue;
      }
    }
  }
  return null;
}

// Fetches enabled rules sorted by priority. Small enough table (dozens of
// rows in steady state) that we don't paginate.
export async function loadRules(
  supabase: SupabaseClient,
  orgId: string
): Promise<CategoryRule[]> {
  const { data, error } = await supabase
    .from("fin_category_rules")
    .select("id, pattern, pattern_type, category_id, restricted, priority, enabled")
    .eq("org_id", orgId)
    .eq("enabled", true)
    .order("priority", { ascending: false });
  if (error) {
    console.error("[finance] loadRules failed:", error.message);
    return [];
  }
  return (data ?? []) as CategoryRule[];
}

// Increments hit_count for each rule that matched at least once during an
// import. Best-effort; failures here are logged but don't break the import.
export async function bumpHitCounts(
  supabase: SupabaseClient,
  hits: Map<string, number>
): Promise<void> {
  const entries: Array<[string, number]> = [];
  hits.forEach((count, ruleId) => entries.push([ruleId, count]));

  for (const [ruleId, count] of entries) {
    const { error } = await supabase.rpc("fin_bump_rule_hits", {
      rule_id: ruleId,
      delta: count,
    });
    if (error) {
      // RPC may not exist in early environments — fall back to a read-mod-
      // write. Still best-effort.
      const { data } = await supabase
        .from("fin_category_rules")
        .select("hit_count")
        .eq("id", ruleId)
        .single();
      const next = (data?.hit_count ?? 0) + count;
      await supabase
        .from("fin_category_rules")
        .update({ hit_count: next })
        .eq("id", ruleId);
    }
  }
}
