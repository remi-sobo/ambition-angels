import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Meeting follow-up exclusions: an operator can mark a calendar event as never
 * needing follow-up — permanently, including all future instances of a
 * recurring event (Jaiye's basketball practice should not ask for a follow-up
 * every week). Excluded series keys live in meeting_exclusions per owner; the
 * meetings sync skips them (no meeting_record is created) and the Upcoming
 * list hides them. Business meetings are untouched.
 */

export type SeriesSource = {
  google_event_id?: string | null;
  recurring_event_id?: string | null;
};

// Google expands recurring events into instances whose id is
// "<seriesId>_<originalStart>" (e.g. "abc123_20260714T170000Z", or
// "abc123_20260714" for all-day). Rows synced before recurring_event_id
// existed lack the field, so fall back to stripping the instance suffix.
const INSTANCE_SUFFIX = /_(?:R\d{8}T\d{6}|\d{8}(?:T\d{6}Z?)?)$/;

/**
 * Stable exclusion key for a calendar event: the series id for a recurring
 * instance, the event's own id for a one-off. Null when the event has no
 * google id (shouldn't happen for synced rows).
 */
export function seriesKey(ev: SeriesSource): string | null {
  if (ev.recurring_event_id) return ev.recurring_event_id;
  const gid = ev.google_event_id;
  if (!gid) return null;
  return gid.replace(INSTANCE_SUFFIX, "");
}

/** True when the event is an instance of a recurring series. */
export function isRecurringInstance(ev: SeriesSource): boolean {
  if (ev.recurring_event_id) return true;
  const gid = ev.google_event_id;
  return !!gid && INSTANCE_SUFFIX.test(gid);
}

/**
 * The excluded series keys visible to this client. With the session client,
 * RLS already scopes rows to the viewer (owner-or-grantee); a service-role
 * caller MUST pass ownerUserId (the house trap: org_id alone is not enough
 * to keep one owner's exclusions from hiding another owner's meetings).
 */
export async function loadExcludedSeriesKeys(
  sb: SupabaseClient,
  orgId: string,
  ownerUserId?: string
): Promise<Set<string>> {
  let q = sb.from("meeting_exclusions").select("series_key").eq("org_id", orgId);
  if (ownerUserId) q = q.eq("owner_user_id", ownerUserId);
  const { data } = await q;
  return new Set(
    ((data ?? []) as Array<{ series_key: string }>).map((r) => r.series_key)
  );
}

/** Escape LIKE wildcards so a series key is matched literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

/**
 * Record an exclusion for the series `key` and sweep existing still-open
 * meeting_records of the same series to `status`, so the whole backlog of a
 * recurring personal event clears in one click. Service-role caller;
 * org/owner-scoped explicitly. Idempotent.
 */
export async function excludeSeries(
  sb: SupabaseClient,
  args: {
    orgId: string;
    ownerUserId: string;
    key: string;
    title: string | null;
    status: "none_needed" | "dismissed";
  }
): Promise<void> {
  const { orgId, ownerUserId, key, title, status } = args;

  await sb.from("meeting_exclusions").upsert(
    { org_id: orgId, owner_user_id: ownerUserId, series_key: key, title },
    { onConflict: "org_id,owner_user_id,series_key", ignoreDuplicates: true }
  );

  // Every mirrored event in the series: matching recurring_event_id, the
  // series event itself, or (pre-backfill rows) an instance id "<key>_...".
  const ids = new Set<string>();
  const byRecurring = await sb
    .from("calendar_events")
    .select("id")
    .eq("org_id", orgId)
    .eq("owner_user_id", ownerUserId)
    .eq("recurring_event_id", key);
  const byGoogleId = await sb
    .from("calendar_events")
    .select("id")
    .eq("org_id", orgId)
    .eq("owner_user_id", ownerUserId)
    .eq("google_event_id", key);
  const byInstanceId = await sb
    .from("calendar_events")
    .select("id")
    .eq("org_id", orgId)
    .eq("owner_user_id", ownerUserId)
    .like("google_event_id", `${escapeLike(key)}\\_%`);
  for (const rows of [byRecurring.data, byGoogleId.data, byInstanceId.data]) {
    for (const r of (rows ?? []) as Array<{ id: string }>) ids.add(r.id);
  }
  if (ids.size === 0) return;

  await sb
    .from("meeting_records")
    .update({ follow_up_status: status, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("follow_up_status", "needs_follow_up")
    .in("calendar_event_id", Array.from(ids));
}
