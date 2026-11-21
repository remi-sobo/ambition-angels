import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import type { OrgContext } from "./auth";

/**
 * Every permission the signed-in role holds, read once per request from
 * role_permissions (world-readable to any signed-in user, the same table
 * ctxHasPermission reads). Feeds the nav's role filter (lib/admin/
 * navPermissions.ts); the server guard stays the real boundary.
 * Fails closed: a failed read returns no permissions.
 */
export const getRolePermissions = cache(async (role: OrgContext["role"]): Promise<string[]> => {
  const { data, error } = await createServerSupabase()
    .from("role_permissions")
    .select("permission")
    .eq("role", role);
  if (error) return [];
  return (data ?? []).map((r: { permission: string }) => r.permission);
});
