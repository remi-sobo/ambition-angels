import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getDisplayNames } from "@/lib/admin/profile";
import { deriveAssigneeOptions, type AssigneeOption } from "@/lib/admin/assignees";

/**
 * The active org's assignable people, for server components (client code goes
 * through /api/admin/members + useAssignees instead). Session-client reads, so
 * RLS scopes everything to the caller's own org.
 */
/** The org owner's first-name handle (oldest owner membership), or null.
 *  Used where work must land with the principal (e.g. BloomOS Upgrade
 *  reports) rather than with the person who happened to file it. */
export const getOrgOwnerHandle = cache(async (): Promise<string | null> => {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const sb = createServerSupabase();
  const { data } = await sb
    .from("memberships")
    .select("user_id")
    .eq("org_id", ctx.orgId)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const ownerId = (data?.user_id as string | undefined) ?? null;
  if (!ownerId) return null;
  const names = await getDisplayNames([ownerId]);
  const options = deriveAssigneeOptions(
    names[ownerId] ? [{ displayName: names[ownerId] }] : [],
  );
  return options[0]?.value ?? null;
});

export const getOrgAssignees = cache(async (): Promise<AssigneeOption[]> => {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  const sb = createServerSupabase();
  const { data: mems } = await sb
    .from("memberships")
    .select("user_id, role")
    .eq("org_id", ctx.orgId);
  const rows = (mems ?? []) as Array<{ user_id: string; role: string }>;
  if (rows.length === 0) return [];
  const names = await getDisplayNames(rows.map((r) => r.user_id));
  return deriveAssigneeOptions(
    rows
      .filter((r) => names[r.user_id])
      .map((r) => ({ displayName: names[r.user_id], role: r.role })),
  );
});
