import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, type OrgContext } from "@/lib/admin/auth";

/**
 * Shared authorization for Staff mutation routes. Loads the target staff row on
 * the SESSION client (RLS-gated) and asks can_view_staff — the same question the
 * sensitive-tier policies ask — so a route can return a clean 403 instead of the
 * silent empty write RLS would give. Never uses the service-role client.
 */
export type StaffAccess = {
  supabase: SupabaseClient;
  ctx: OrgContext;
  staff: { id: string; org_id: string; user_id: string };
  canView: boolean;
  isSelf: boolean;
};

export async function resolveStaffAccess(staffId: string): Promise<StaffAccess | null> {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const supabase = createServerSupabase();
  const { data: staff } = await supabase
    .from("staff")
    .select("id, org_id, user_id")
    .eq("id", staffId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!staff) return null;
  const row = staff as { id: string; org_id: string; user_id: string };
  const { data: canView } = await supabase.rpc("can_view_staff", { p_staff_id: staffId });
  return { supabase, ctx, staff: row, canView: canView === true, isSelf: row.user_id === ctx.userId };
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Coerce a form/JSON value to a finite number or null. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Trim a string field to null if empty, capped at max length. */
export function str(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
