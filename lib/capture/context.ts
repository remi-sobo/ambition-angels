/**
 * Resolve the entity a capture started from (ruling 1, "context entity as a
 * strong prior"). Session client only: if RLS hides the row, there is no
 * context, and the capture proceeds without a prior rather than failing.
 *
 * constituent / partner map to themselves; an opportunity maps to its
 * constituent (the person the ask is with). Students are not a context type.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { constituentName } from "@/lib/fundraising/display";
import type { ContextEntity } from "./types";

export type ContextType = "constituent" | "partner" | "opportunity";
export const CONTEXT_TYPES: readonly ContextType[] = ["constituent", "partner", "opportunity"];

async function constituentContext(supabase: SupabaseClient, id: string): Promise<ContextEntity | null> {
  const { data } = await supabase
    .from("constituents")
    .select("id, type, first_name, last_name, org_name")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null };
  return {
    type: "constituent",
    id: row.id,
    name: constituentName(row),
    orgName: row.type === "organization" ? null : row.org_name,
    meta: row.type === "organization" ? "organization" : "person",
  };
}

export async function resolveContext(
  supabase: SupabaseClient,
  type: ContextType,
  id: string,
): Promise<ContextEntity | null> {
  if (type === "constituent") return constituentContext(supabase, id);
  if (type === "partner") {
    const { data } = await supabase.from("partners").select("id, name, kind, city").eq("id", id).maybeSingle();
    if (!data) return null;
    const row = data as { id: string; name: string | null; kind: string | null; city: string | null };
    return {
      type: "partner",
      id: row.id,
      name: row.name?.trim() || "Partner",
      orgName: null,
      meta: [row.kind, row.city].filter(Boolean).join(" · ") || null,
    };
  }
  // opportunity -> its constituent
  const { data } = await supabase.from("opportunities").select("constituent_id").eq("id", id).maybeSingle();
  const cid = (data as { constituent_id: string | null } | null)?.constituent_id ?? null;
  return cid ? constituentContext(supabase, cid) : null;
}
