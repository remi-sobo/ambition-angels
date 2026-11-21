import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { MemberRole } from "./people";

/**
 * Settings → People and roles: the reads and writes behind the screen and
 * its routes. Callers MUST have passed requirePermission("members.manage")
 * first (the routes and the page do; tests/role-guard-coverage.test.ts
 * holds them to it).
 *
 * Two clients, on purpose:
 *  - memberships are read and written through the SESSION client with the
 *    active org pinned in every filter, so memberships RLS
 *    (has_permission(org_id, 'members.manage')) is a second fence: even a
 *    bug here cannot write another org's rows;
 *  - only the auth admin API (emails, sign-in times, the invite email)
 *    uses the service role, because auth.users is not reachable otherwise.
 *
 * Invites use what exists, with no schema change: Supabase Auth's
 * inviteUserByEmail creates the account and sends the set-a-password email,
 * then the membership row is written for the active org. org_email_allowlist
 * (one org per email, primary key) is deliberately NOT written: it would
 * collide with, or overwrite, another org's entry for the same address.
 */

export type Member = {
  userId: string;
  role: MemberRole;
  email: string;
  name: string | null;
  joinedAt: string;
  /** Never signed in: the invite is still open. */
  invited: boolean;
  lastSignIn: string | null;
};

type MembershipRow = { user_id: string; role: MemberRole; created_at: string };

export async function listMembers(orgId: string): Promise<{ members: Member[]; error: string | null }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return { members: [], error: error.message };
  const rows = (data ?? []) as MembershipRow[];
  const ids = rows.map((r) => r.user_id);

  const [{ data: profiles }, users] = await Promise.all([
    ids.length
      ? supabase.from("profiles").select("user_id, display_name").in("user_id", ids)
      : Promise.resolve({ data: [] as { user_id: string; display_name: string | null }[] }),
    Promise.all(
      ids.map((id) =>
        getSupabaseAdmin()
          .auth.admin.getUserById(id)
          .then((r) => r.data.user)
          .catch(() => null),
      ),
    ),
  ]);
  const names = new Map(
    ((profiles ?? []) as { user_id: string; display_name: string | null }[]).map((p) => [p.user_id, p.display_name]),
  );
  return {
    error: null,
    members: rows.map((r, i) => {
      const u = users[i];
      return {
        userId: r.user_id,
        role: r.role,
        // A membership whose auth account can't be read (deleted, or the
        // admin API failed) still lists, so it can be removed.
        email: u?.email ?? "Account not found",
        name: names.get(r.user_id)?.trim() || null,
        joinedAt: r.created_at,
        invited: !!u && !u.last_sign_in_at,
        lastSignIn: u?.last_sign_in_at ?? null,
      };
    }),
  };
}

/** One member of the active org, or null (never another org's row). */
export async function getMembership(orgId: string, userId: string): Promise<{ userId: string; role: MemberRole } | null> {
  const { data } = await createServerSupabase()
    .from("memberships")
    .select("user_id, role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? { userId: data.user_id as string, role: data.role as MemberRole } : null;
}

export async function countOwners(orgId: string): Promise<number> {
  const { count } = await createServerSupabase()
    .from("memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "owner");
  return count ?? 0;
}

/** Find an existing auth user by email. The admin API has no lookup by
 *  email, so this pages the user list (1,000 a page, capped at 20 pages). */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export type InviteOutcome =
  | { ok: true; userId: string; emailed: boolean }
  | { ok: false; status: 409 | 500; error: string };

/**
 * Invite `email` into the active org as `role`.
 *  - New address: Supabase sends the invite email (set a password, land on
 *    /admin) and the membership is written now, so the person appears as
 *    "Invited" until they first sign in.
 *  - Existing account: no email from Supabase; they are added and can sign
 *    in with the account they have.
 *  - Already in this org: 409, nothing changes.
 */
export async function inviteMember(
  orgId: string,
  email: string,
  role: MemberRole,
  redirectTo: string,
): Promise<InviteOutcome> {
  let userId = await findUserIdByEmail(email);
  let emailed = false;
  if (userId) {
    if (await getMembership(orgId, userId)) {
      return { ok: false, status: 409, error: "That person is already in this organization." };
    }
  } else {
    const { data, error } = await getSupabaseAdmin().auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error || !data.user) {
      console.error("Invite failed:", error?.message);
      return { ok: false, status: 500, error: "The invite didn't send. Try again." };
    }
    userId = data.user.id;
    emailed = true;
  }

  // Upsert: the sign-up trigger may already have added this person to this
  // org as staff (an org email-domain rule). The invited role wins.
  const { error } = await createServerSupabase()
    .from("memberships")
    .upsert({ user_id: userId, org_id: orgId, role }, { onConflict: "user_id,org_id" });
  if (error) {
    console.error("Invite membership write failed:", error.message);
    return { ok: false, status: 500, error: "The invite was sent, but adding them failed. Try again." };
  }
  return { ok: true, userId, emailed };
}

export async function setMemberRole(orgId: string, userId: string, role: MemberRole): Promise<string | null> {
  const { error } = await createServerSupabase()
    .from("memberships")
    .update({ role })
    .eq("org_id", orgId)
    .eq("user_id", userId);
  return error ? error.message : null;
}

/** Remove the person from the active org only. Their account, and any other
 *  org they belong to, are untouched. The active org's allowlist entry for
 *  their email goes too, so a future sign-up does not re-add them. */
export async function removeMember(orgId: string, userId: string): Promise<string | null> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("memberships").delete().eq("org_id", orgId).eq("user_id", userId);
  if (error) return error.message;
  const { data } = await getSupabaseAdmin().auth.admin.getUserById(userId);
  const email = data.user?.email?.toLowerCase();
  if (email) {
    await supabase.from("org_email_allowlist").delete().eq("org_id", orgId).eq("email", email);
  }
  return null;
}

/** Put an owner membership back (the last-owner race in the DELETE route). */
export async function restoreOwner(orgId: string, userId: string): Promise<void> {
  await createServerSupabase()
    .from("memberships")
    .upsert({ user_id: userId, org_id: orgId, role: "owner" }, { onConflict: "user_id,org_id" });
}
