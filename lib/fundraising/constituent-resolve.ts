import type { SupabaseClient } from "@supabase/supabase-js";

// Shared "match-or-create a constituent from a free-text name" used by the
// opportunities create route and the Strategy add-funder route. Given an
// explicit constituent_id it returns it as-is; given a name it matches an
// existing constituent case-insensitively (org name, or first+last), links the
// single match, links the first of several (with a warning), or creates a new
// person constituent (with a warning). Prefer passing constituentId from a
// picked search result — the name path is the fallback that can mis-match.

export type ResolveResult =
  | { constituentId: string; warning?: string }
  | { error: string; status: number };

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function resolveConstituent(
  supabase: SupabaseClient,
  input: { constituentId?: unknown; name?: unknown }
): Promise<ResolveResult> {
  if (isUuid(input.constituentId)) return { constituentId: input.constituentId };

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return { error: "constituent_id or constituent_name is required", status: 400 };
  }

  // Person match on "first last", org match on org_name.
  const parts = name.split(/\s+/);
  const first = parts[0] ?? "";
  const rest = parts.slice(1).join(" ");
  const { data: matches } = await supabase
    .from("constituents")
    .select("id, type, first_name, last_name, org_name")
    .or(
      [
        `org_name.ilike.${name}`,
        rest
          ? `and(first_name.ilike.${first},last_name.ilike.${rest})`
          : `first_name.ilike.${name}`,
        rest ? "" : `last_name.ilike.${name}`,
      ]
        .filter(Boolean)
        .join(",")
    )
    .limit(2);

  if (matches && matches.length === 1) return { constituentId: matches[0].id };
  if (matches && matches.length > 1) {
    return {
      constituentId: matches[0].id,
      warning: `Multiple constituents match "${name}" — linked the first; verify on the donor page.`,
    };
  }

  const { data: created, error } = await supabase
    .from("constituents")
    .insert({ type: "person", first_name: first || name, last_name: rest || null, source: "manual" })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[resolveConstituent] create failed:", error?.message);
    return { error: "Could not create constituent", status: 500 };
  }
  return {
    constituentId: created.id,
    warning: `Created a new constituent for "${name}" — add contact details on the donor page.`,
  };
}
