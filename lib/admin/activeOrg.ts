import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Active-org resolution, edge-safe (no next/headers, no react.cache) so both
 * the server helpers in lib/admin/auth.ts and middleware.ts share ONE rule.
 */

/** Cookie naming the user's active org (core fence spec §6c, C1). Written
 *  ONLY by /api/admin/org/switch after validating membership — server
 *  components can't set cookies, so reads ignore an invalid value instead of
 *  clearing it (the deterministic fallback makes that harmless). */
export const ACTIVE_ORG_COOKIE = "bloom_active_org";

/** Active-org resolution rule (core fence spec §6c), pure for testability:
 *  a cookie naming an org the user belongs to wins; otherwise (no cookie,
 *  or a stale/foreign value) fall back to the oldest membership. */
export function resolveActiveMembership<T extends { org_id: string }>(
  memberships: readonly T[],
  cookieOrgId: string | null | undefined,
): T | null {
  if (memberships.length === 0) return null;
  if (cookieOrgId) {
    const match = memberships.find((m) => m.org_id === cookieOrgId);
    if (match) return match;
  }
  return memberships[0];
}

/**
 * Middleware-cheap entitlement check for a signed-in user: resolve the ACTIVE
 * org exactly like getOrgContext does, then ask whether that org holds an
 * enabled entitlement. Both reads go through the caller's SESSION client, so
 * RLS limits them to the user's own memberships and own orgs' entitlements.
 * Fails closed on any error or missing row.
 */
export async function sessionOrgHasEntitlement(
  supabase: SupabaseClient,
  userId: string,
  cookieOrgId: string | null | undefined,
  key: string,
): Promise<boolean> {
  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return false;
  const active = resolveActiveMembership((memberships ?? []) as { org_id: string }[], cookieOrgId);
  if (!active) return false;
  const { data } = await supabase
    .from("org_entitlements")
    .select("feature_key")
    .eq("org_id", active.org_id)
    .eq("feature_key", key)
    .eq("enabled", true)
    .maybeSingle();
  return !!data;
}
