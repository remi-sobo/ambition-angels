import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * BloomOS Ring 1 auth helpers, backed by Supabase Auth.
 *
 * A request is "authed" when it carries a valid Supabase session AND the
 * user holds a membership in at least one org (memberships are provisioned
 * by the on_auth_user_created trigger — see
 * supabase/migrations/create_membership_bootstrap.sql). A random self-signup
 * gets a session but no membership, and is rejected here.
 *
 * The legacy `AdminUser` name type survives for display/attribution compat
 * ("remi" / "shannon" appear in ops task fields and UI). It is derived from
 * the email local-part and will be replaced by real user references as
 * Ring 1 route conversion proceeds.
 */

export type AdminUser = "remi" | "shannon";

export type OrgContext = {
  userId: string;
  email: string;
  orgId: string;
  /** Display name from the orgs row — the ONLY place tenant identity may
   *  come from in shell chrome (greeting, sidebar tagline, report headers).
   *  A shared host must never hardcode a tenant name. */
  orgName: string;
  role: "owner" | "admin" | "staff" | "finance" | "board_viewer";
};

/** Session + membership context, or null when unauthenticated/unprovisioned.
 *  React-cached so layout + page can both call it in one request. */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS on memberships lets a user read only rows in orgs they belong to,
  // so any row coming back proves membership. The orgs embed rides the same
  // proof ("members read org" policy).
  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id, role, orgs(name)")
    .eq("user_id", user.id)
    // Deterministic pick when a user holds several memberships: oldest wins.
    // Interim fix — the real resolution is the bloom_active_org cookie +
    // switcher (core fence spec §6c, Phase C1).
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  // Many-to-one embed; supabase-js without generated types may hand back an
  // object or a one-element array depending on inference.
  const orgRow = membership.orgs as { name: string } | { name: string }[] | null;
  const orgName =
    (Array.isArray(orgRow) ? orgRow[0]?.name : orgRow?.name) || "your organization";

  return {
    userId: user.id,
    email: user.email ?? "",
    orgId: membership.org_id,
    orgName,
    role: membership.role,
  };
});

export async function isAuthed(): Promise<boolean> {
  return (await getOrgContext()) !== null;
}

/**
 * Permission check for code paths that run on the service-role client (which
 * bypasses RLS) — e.g. the plan write routes. RLS policies gate writes with
 * `private.has_permission(org_id, perm)`; a service-role route must re-assert
 * the same gate in app code or the policy is silently skipped. We check the
 * permission (not the role name) so a role/permission change stays a data
 * change, exactly like the RLS helper. `role_permissions` is world-readable to
 * any authenticated user, so the session client can read it.
 */
export async function ctxHasPermission(ctx: OrgContext, perm: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("role_permissions")
    .select("permission")
    .eq("role", ctx.role)
    .eq("permission", perm)
    .maybeSingle();
  return !!data;
}

export async function getAdminUser(): Promise<AdminUser | null> {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const local = ctx.email.split("@")[0]?.toLowerCase();
  return local === "shannon" ? "shannon" : "remi";
}
