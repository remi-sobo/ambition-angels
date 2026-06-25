import type { SupabaseClient } from "@supabase/supabase-js";
import type { calendar_v3 } from "googleapis";
import {
  listActiveCalendarConnections,
  calendarClientFromRefreshToken,
  type GoogleCalendarConnection,
} from "@/lib/google/connection";

/**
 * Service-role Google Calendar → calendar_events sync (BloomOS Agenda Phase 2).
 * Mirrors the gmail sync pattern. For each connected user it pulls events in a
 * window around today, upserts them keyed on (owner_user_id, google_event_id),
 * then deletes in-window google rows it didn't just touch — so cancellations and
 * deletions fall out of the cache. is_external is computed against the org's
 * email domain at sync time.
 */

const LOOKBACK_DAYS = 1;
const LOOKAHEAD_DAYS = 21; // covers "today" and the current + next week views
const PAGE_SIZE = 250;

export type SyncCounts = { fetched: number; upserted: number; deleted: number };

export function syncWindow(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000),
    end: new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000),
  };
}

async function orgDomain(sb: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await sb.from("orgs").select("settings").eq("id", orgId).maybeSingle();
  const d = (data?.settings as Record<string, unknown> | null)?.email_domain as string | undefined;
  return (d ?? "ambitionangels.org").toLowerCase();
}

function eventTime(part: calendar_v3.Schema$EventDateTime | undefined): {
  iso: string | null;
  allDay: boolean;
} {
  if (part?.dateTime) return { iso: part.dateTime, allDay: false };
  if (part?.date) return { iso: `${part.date}T00:00:00Z`, allDay: true }; // all-day: date at UTC midnight
  return { iso: null, allDay: false };
}

function mapEvent(
  e: calendar_v3.Schema$Event,
  conn: GoogleCalendarConnection,
  domain: string,
  syncedAt: string
) {
  const start = eventTime(e.start ?? undefined);
  const end = eventTime(e.end ?? undefined);
  const attendees = (e.attendees ?? []).map((a) => ({
    email: a.email ?? null,
    displayName: a.displayName ?? null,
    responseStatus: a.responseStatus ?? null,
    organizer: a.organizer ?? false,
  }));
  const isExternal = attendees.some(
    (a) => a.email && !a.email.toLowerCase().endsWith(`@${domain}`)
  );
  return {
    org_id: conn.orgId,
    owner_user_id: conn.userId,
    google_event_id: e.id,
    calendar_id: conn.calendarId,
    title: e.summary ?? null,
    description: e.description ?? null,
    location: e.location ?? null,
    start_time: start.iso,
    end_time: end.iso,
    all_day: start.allDay,
    status: e.status ?? null,
    attendees,
    is_external: isExternal,
    source: "google",
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

/** Sync one user's calendar for the window. Returns counts. */
export async function syncUserCalendar(
  sb: SupabaseClient,
  conn: GoogleCalendarConnection,
  window: { start: Date; end: Date }
): Promise<SyncCounts> {
  const cal = calendarClientFromRefreshToken(conn.refreshToken);

  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await cal.events.list({
      calendarId: conn.calendarId,
      timeMin: window.start.toISOString(),
      timeMax: window.end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: PAGE_SIZE,
      pageToken,
    });
    items.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const domain = await orgDomain(sb, conn.orgId);
  const syncedAt = new Date().toISOString();
  const rows = items
    .filter((e) => e.id && e.status !== "cancelled")
    .map((e) => mapEvent(e, conn, domain, syncedAt));

  let upserted = 0;
  if (rows.length) {
    const { error } = await sb
      .from("calendar_events")
      .upsert(rows, { onConflict: "owner_user_id,google_event_id" });
    if (error) throw new Error(`calendar_events upsert failed: ${error.message}`);
    upserted = rows.length;
  }

  // Anything in-window from google that we didn't touch this run is stale
  // (deleted/cancelled in Google) — drop it so the cache matches reality.
  const { count: deleted } = await sb
    .from("calendar_events")
    .delete({ count: "exact" })
    .eq("owner_user_id", conn.userId)
    .eq("source", "google")
    .gte("start_time", window.start.toISOString())
    .lte("start_time", window.end.toISOString())
    .lt("synced_at", syncedAt);

  return { fetched: items.length, upserted, deleted: deleted ?? 0 };
}

export type SyncResult = { userId: string; orgId: string } & (
  | { ok: true; counts: SyncCounts }
  | { ok: false; error: string }
);

/** Sync every active Google Calendar connection, logging a run per user. */
export async function runCalendarSync(sb: SupabaseClient, now: Date): Promise<SyncResult[]> {
  const conns = await listActiveCalendarConnections();
  const window = syncWindow(now);
  const results: SyncResult[] = [];

  for (const conn of conns) {
    const { data: job } = await sb
      .from("calendar_sync_jobs")
      .insert({
        org_id: conn.orgId,
        owner_user_id: conn.userId,
        status: "running",
        window_start: window.start.toISOString(),
        window_end: window.end.toISOString(),
      })
      .select("id")
      .single();
    const jobId = job?.id as string | undefined;

    try {
      const counts = await syncUserCalendar(sb, conn, window);
      if (jobId) {
        await sb
          .from("calendar_sync_jobs")
          .update({
            status: "completed",
            counts,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
      results.push({ userId: conn.userId, orgId: conn.orgId, ok: true, counts });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (jobId) {
        await sb
          .from("calendar_sync_jobs")
          .update({
            status: "failed",
            errors: [{ message, occurred_at: new Date().toISOString() }],
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
      // Token lapse / Google outage degrades to stale cache, never a crash.
      console.error(`calendar sync failed for user ${conn.userId}:`, message);
      results.push({ userId: conn.userId, orgId: conn.orgId, ok: false, error: message });
    }
  }

  return results;
}
