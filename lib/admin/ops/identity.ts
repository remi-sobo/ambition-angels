import "server-only";
import { getOrgContext, type AdminUser, type OrgContext } from "@/lib/admin/auth";

/**
 * The ONE resolver for "who am I, and which ops handle is mine."
 *
 * Operating Rhythm v2, Phase 2. The legacy `ops_tasks.assigned_to` column is
 * free text ('remi' / 'shannon') while calendar/meeting tables key on
 * `owner_user_id uuid` — so "my week" needs a single place that maps the authed
 * session to BOTH the legacy text handle (for ops_tasks "mine" filters) and the
 * real auth uuid (for calendar_events / meeting_records). Route every "mine"
 * filter through here.
 *
 * This is auth-backed and supersedes the `admin_user` cookie the ops surfaces
 * read today (the cookie is set nowhere and only cleared on logout — it
 * defaults silently to 'remi', which would show the wrong person's tasks). The
 * handle derivation matches getAdminUser() (email local-part) so behavior is
 * identical, just sourced from the session instead of a cookie. When real user
 * references replace the text handle, only this function changes.
 */

export type ResolvedUser = {
  /** Legacy ops_tasks.assigned_to text handle. */
  handle: AdminUser;
  /** auth.uid() — matches calendar_events.owner_user_id / meeting_records.owner_user_id. */
  userId: string;
  orgId: string;
  role: OrgContext["role"];
  email: string;
};

/** Resolve the signed-in user to their ops handle + ids, or null if unauthed. */
export async function resolveUserHandle(): Promise<ResolvedUser | null> {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const local = ctx.email.split("@")[0]?.toLowerCase();
  const handle: AdminUser = local === "shannon" ? "shannon" : "remi";
  return {
    handle,
    userId: ctx.userId,
    orgId: ctx.orgId,
    role: ctx.role,
    email: ctx.email,
  };
}
