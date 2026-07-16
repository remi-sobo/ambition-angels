import { cache } from "react";
import { cookies } from "next/headers";
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

/** Cookie naming the user's active org (core fence spec §6c, C1). Written
 *  ONLY by /api/admin/org/switch after validating membership — server
 *  components can't set cookies, so reads here ignore an invalid value
 *  instead of clearing it (the deterministic fallback makes that harmless). */
export const ACTIVE_ORG_COOKIE = "bloom_active_org";

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

type MembershipRow = {
  org_id: string;
  role: OrgContext["role"];
  orgs: { name: string } | { name: string }[] | null;
};

// Many-to-one embed; supabase-js without generated types may hand back an
// object or a one-element array depending on inference.
function embeddedOrgName(row: MembershipRow): string {
  const org = row.orgs;
  return (Array.isArray(org) ? org[0]?.name : org?.name) || "your organization";
}

/** Session user + ALL their memberships, oldest first. RLS on memberships
 *  lets a user read only rows in orgs they belong to, so any row coming back
 *  proves membership; the orgs embed rides the same proof ("members read
 *  org" policy). React-cached — context, switcher, and pages share one read. */
const getSessionMemberships = cache(
  async (): Promise<{ userId: string; email: string; memberships: MembershipRow[] } | null> => {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("memberships")
      .select("org_id, role, orgs(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    return {
      userId: user.id,
      email: user.email ?? "",
      memberships: (data ?? []) as MembershipRow[],
    };
  },
);

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

/** Session + membership context, or null when unauthenticated/unprovisioned.
 *  React-cached so layout + page can both call it in one request. */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const session = await getSessionMemberships();
  if (!session) return null;

  const cookieOrgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  const membership = resolveActiveMembership(session.memberships, cookieOrgId);
  if (!membership) return null;

  return {
    userId: session.userId,
    email: session.email,
    orgId: membership.org_id,
    orgName: embeddedOrgName(membership),
    role: membership.role,
  };
});

export type UserOrg = { orgId: string; orgName: string; role: OrgContext["role"] };

/** The session user's orgs (oldest membership first) — feeds the sidebar
 *  org switcher, which only renders with 2+ entries. */
export async function getUserOrgs(): Promise<UserOrg[]> {
  const session = await getSessionMemberships();
  if (!session) return [];
  return session.memberships.map((m) => ({
    orgId: m.org_id,
    orgName: embeddedOrgName(m),
    role: m.role,
  }));
}

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
