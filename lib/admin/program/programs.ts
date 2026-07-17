import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Programs — the parent of a group/cohort (participant spine, spec #4 D4).
 *
 * A program is a real per-org entity (programs table); cohorts.program_id
 * references it. Groups still carry a free-text `program` label too (kept in
 * lockstep during the transition), so unmigrated readers render unchanged.
 */

export type Program = { id: string; name: string };

/** The org's programs, for the cohort form's suggestions. Session client (RLS). */
export async function getPrograms(orgId: string): Promise<Program[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("programs")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("name");
  return (data ?? []) as Program[];
}

/**
 * Resolve a program NAME to its id for an org, creating it if new (case-
 * insensitive match on the unique (org_id, name)). Returns null for an empty
 * name. Mirrors findOrCreateFunder. Uses whatever client the caller passes so
 * it runs on the same (service-role or session) client as the cohort write.
 */
export async function findOrCreateProgram(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const trimmed = name.trim().slice(0, 160);
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from("programs")
    .select("id, name")
    .eq("org_id", orgId)
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing) return existing as { id: string; name: string };

  const { data: created, error } = await supabase
    .from("programs")
    .insert({ org_id: orgId, name: trimmed })
    .select("id, name")
    .single();
  if (error || !created) {
    console.error("[programs] find-or-create failed:", error?.message);
    return null;
  }
  return created as { id: string; name: string };
}

/** The org's programs for the current session (convenience for pages). */
export async function getSessionPrograms(): Promise<Program[]> {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  return getPrograms(ctx.orgId);
}
