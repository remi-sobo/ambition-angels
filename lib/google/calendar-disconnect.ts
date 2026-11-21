import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decryptSecret, fromBytea } from "@/lib/crypto/secret-box";
import { listActiveCalendarConnections } from "@/lib/google/connection";
import { stopCalendarWatch } from "@/lib/google/watch";
import { googleOAuthClientFor } from "@/lib/google/oauth";
import { mayRevokeGoogleGrant } from "@/lib/google/grant";

/**
 * Disconnect one person's Google Calendar from BloomOS (Settings → Google
 * Calendar → Disconnect). What the privacy policy promises: BloomOS stops
 * reading the calendar and deletes the stored permission.
 *
 *  1. Stop any push channels (best effort).
 *  2. Delete every google_calendar connection row for this person in this
 *     org, including a half-finished `pending` one.
 *  3. Delete the cached Google events (calendar_events, source 'google').
 *     Work blocks stay in BloomOS; the events they already put on Google
 *     Calendar stay there, because they are the person's events now.
 *  4. Revoke the grant at Google only when nothing else BloomOS holds uses
 *     that account (lib/google/grant.ts).
 *
 * Service role: callers must already have resolved the session's own org and
 * user. This only ever touches the caller's own rows.
 */
export async function disconnectGoogleCalendar(args: {
  orgId: string;
  userId: string;
}): Promise<{ accountEmails: string[]; calendarIds: string[]; revoked: number }> {
  const sb = getSupabaseAdmin();

  for (const conn of await listActiveCalendarConnections({ userId: args.userId, orgId: args.orgId })) {
    try {
      await stopCalendarWatch(conn);
    } catch (err) {
      console.error("stopping calendar watch failed (continuing):", err instanceof Error ? err.message : err);
    }
  }

  const { data: rows, error } = await sb
    .from("connections")
    .select("id, external_id, status, refresh_token_enc, meta")
    .eq("provider", "google_calendar")
    .eq("org_id", args.orgId)
    .eq("user_id", args.userId);
  if (error) throw new Error(`loading calendar connections failed: ${error.message}`);
  if (!rows?.length) return { accountEmails: [], calendarIds: [], revoked: 0 };

  // One refresh token per Google account; several calendars can share it.
  const tokens = new Map<string, string | null>(); // token -> account email
  const calendarIds: string[] = [];
  for (const r of rows) {
    const meta = r.meta as Record<string, unknown> | null;
    if (r.status !== "pending") {
      calendarIds.push((meta?.calendar_id as string) ?? (r.external_id as string));
    }
    if (r.refresh_token_enc) {
      try {
        tokens.set(decryptSecret(fromBytea(r.refresh_token_enc)), (meta?.account_email as string) ?? null);
      } catch {
        // Undecryptable token: nothing to revoke, the row still goes.
      }
    }
  }
  const ids = rows.map((r) => r.id as string);

  const { error: delErr } = await sb.from("connections").delete().in("id", ids);
  if (delErr) throw new Error(`deleting calendar connections failed: ${delErr.message}`);

  const { error: evErr } = await sb
    .from("calendar_events")
    .delete()
    .eq("org_id", args.orgId)
    .eq("owner_user_id", args.userId)
    .eq("source", "google");
  if (evErr) console.error("deleting cached calendar events failed:", evErr.message);

  let revoked = 0;
  for (const [token, accountEmail] of Array.from(tokens.entries())) {
    if (!(await mayRevokeGoogleGrant(accountEmail, ids))) continue;
    try {
      await googleOAuthClientFor().revokeToken(token);
      revoked++;
    } catch (err) {
      console.error("revoking calendar grant failed (continuing):", err instanceof Error ? err.message : err);
    }
  }

  const accountEmails = Array.from(
    new Set(Array.from(tokens.values()).filter((e): e is string => !!e))
  );
  return { accountEmails, calendarIds, revoked };
}
