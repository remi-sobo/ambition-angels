import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { resolveCreateOwner, type OrgMember } from "@/lib/admin/owners";

/**
 * The server half of assignment (see owners.ts). Session client with the
 * active org pinned in every filter, so a member of two orgs only ever sees,
 * and can only assign to, people in the org they are working in.
 */

type MembershipRow = { user_id: string; role: string | null };

function fallbackName(role: string | null): string {
  return role === "owner" ? "Owner" : "Team member";
}

/** Members of an org with display names (profiles), oldest first. */
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const sb = createServerSupabase();
  const { data } = await sb
    .from("memberships")
    .select("user_id, role")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(500);
  const rows = (data ?? []) as MembershipRow[];
  if (rows.length === 0) return [];
  const { data: profiles } = await sb
    .from("profiles")
    .select("user_id, display_name")
    .in(
      "user_id",
      rows.map((r) => r.user_id),
    );
  const names = new Map(
    ((profiles ?? []) as { user_id: string; display_name: string | null }[]).map((p) => [p.user_id, p.display_name?.trim() || ""]),
  );
  return rows.map((r) => ({ userId: r.user_id, name: names.get(r.user_id) || fallbackName(r.role), role: r.role }));
}

/** The ACTIVE org's members, once per request. Empty when signed out. */
export const getActiveOrgMembers = cache(async (): Promise<OrgMember[]> => {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  return listOrgMembers(ctx.orgId);
});

/** True when userId holds a membership in orgId and may own work there. */
export async function isAssignableMember(orgId: string, userId: string): Promise<boolean> {
  const { data } = await createServerSupabase()
    .from("memberships")
    .select("user_id, role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data && (data as MembershipRow).role !== "board_viewer";
}

/**
 * The owner for a record created through the app: the creator by default, or
 * the request's explicit owner_id (null = unassigned) after checking it is a
 * member of the active org. Never overwrites an explicit value.
 */
export async function createOwnerFor(
  body: Record<string, unknown> | null | undefined,
  ctx: { orgId: string; userId: string },
): Promise<{ ok: true; ownerId: string | null } | { ok: false; error: string }> {
  const ownerId = resolveCreateOwner(body, ctx.userId);
  if (ownerId === undefined) return { ok: false, error: "Choose a person to own this record." };
  if (ownerId && ownerId !== ctx.userId && !(await isAssignableMember(ctx.orgId, ownerId))) {
    return { ok: false, error: "That person is not a member of this organization." };
  }
  return { ok: true, ownerId };
}
