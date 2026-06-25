import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * App-layer permission check (Reed Phase 4).
 *
 * Calls public.has_permission(p_org, p_perm) — a SECURITY DEFINER RPC shim over
 * the same private.has_permission that every RLS policy uses, so the app and the
 * database agree on one authority. private.has_permission scopes to auth.uid()
 * internally, so this only ever answers for the calling user.
 *
 * MUST be called with the SESSION client (it carries the user's JWT). Reed's
 * read tools call this to refuse cleanly ("you don't have access to finance")
 * instead of silently returning the empty result RLS would give them — RLS is
 * still the hard boundary underneath; this is defense in depth plus a better
 * answer.
 */
export async function hasPermission(
  supabase: SupabaseClient,
  orgId: string,
  permission: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_permission", {
    p_org: orgId,
    p_perm: permission,
  });
  if (error) {
    // Fail closed: if we can't confirm the permission, deny.
    console.error("[permissions] has_permission rpc failed:", error.message);
    return false;
  }
  return data === true;
}
