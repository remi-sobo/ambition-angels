import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

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

/**
 * Every permission the signed-in user's role carries, in the active org.
 *
 * `role_permissions` is static config, world-readable to any authenticated
 * user, so this is one cheap query through the session client — the same
 * authority `ctxHasPermission` and `private.has_permission` both read.
 *
 * This exists for the SHELL, not for security: `lib/admin/nav.ts` filters nav
 * entries on it so a board viewer isn't shown a Comms section they cannot
 * open. Hiding a link is an affordance; the module layout's gate and RLS are
 * the boundary. Returns null when there is no session, which the nav treats as
 * "pre-auth, show the full IA" — matching how `features` already behaves.
 *
 * React-cached, so the sidebar and the sub-topic bar share one read.
 */
export const getMyPermissions = cache(async (): Promise<string[] | null> => {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("role_permissions")
    .select("permission")
    .eq("role", ctx.role);
  if (error) {
    // Fail OPEN here, unlike hasPermission(): this only decides whether a link
    // is drawn, and a blank sidebar on a transient read error is worse than a
    // link that 403s when clicked.
    console.error("[permissions] role permission read failed:", error.message);
    return null;
  }
  return (data ?? []).map((r) => r.permission as string);
});
