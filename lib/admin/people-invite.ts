import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRole } from "./people";

/**
 * The invite path shared by Settings → People and roles and the operator
 * setup script (V4 Stage F). No "server-only" import, so scripts/setup-org.ts
 * can call it from the operator's machine with its own clients.
 *
 *  - `admin`: a service-role client, used ONLY for the auth admin API
 *    (find the account, send the invite email).
 *  - `db`: the client the membership row is written through. The app passes
 *    the SESSION client (memberships RLS is a second fence); the operator
 *    script passes its service-role client, since there is no session.
 *
 * Behavior is unchanged from lib/admin/people-server.ts before the split.
 */

export type InviteOutcome =
  | { ok: true; userId: string; emailed: boolean }
  | { ok: false; status: 409 | 500; error: string };

/** Find an existing auth user by email. The admin API has no lookup by
 *  email, so this pages the user list (1,000 a page, capped at 20 pages). */
export async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export async function inviteMemberWith(
  clients: { admin: SupabaseClient; db: SupabaseClient },
  orgId: string,
  email: string,
  role: MemberRole,
  redirectTo: string,
  opts: { allowExistingMember?: boolean } = {},
): Promise<InviteOutcome> {
  let userId = await findUserIdByEmail(clients.admin, email);
  let emailed = false;
  if (userId) {
    const { data: member } = await clients.db
      .from("memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (member && !opts.allowExistingMember) {
      return { ok: false, status: 409, error: "That person is already in this organization." };
    }
  } else {
    const { data, error } = await clients.admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error || !data.user) {
      console.error("Invite failed:", error?.message);
      return { ok: false, status: 500, error: "The invite didn't send. Try again." };
    }
    userId = data.user.id;
    emailed = true;
  }

  // Upsert: the sign-up trigger may already have added this person to this
  // org as staff (an org email-domain rule). The invited role wins.
  const { error } = await clients.db
    .from("memberships")
    .upsert({ user_id: userId, org_id: orgId, role }, { onConflict: "user_id,org_id" });
  if (error) {
    console.error("Invite membership write failed:", error.message);
    return { ok: false, status: 500, error: "The invite was sent, but adding them failed. Try again." };
  }
  return { ok: true, userId, emailed };
}
