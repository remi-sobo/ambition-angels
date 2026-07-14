import type { SupabaseClient } from "@supabase/supabase-js";
import type { calendar_v3 } from "googleapis";
import {
  listActiveCalendarConnections,
  calendarClientFromRefreshToken,
  updateConnectionMeta,
  type GoogleCalendarConnection,
} from "@/lib/google/connection";
import { laDateOf, mondayOf } from "@/lib/admin/ops/week";

/**
 * Service-role Google Calendar → calendar_events sync (BloomOS Agenda Phase 2,
 * incremental + two-way flow-back in Phase 5).
 *
 * Per connected user: pull events (incrementally via a stored syncToken when we
 * have one, else a full window), upsert them keyed on (owner_user_id,
 * google_event_id), and reconcile deletions. is_external is computed against the
 * org's email domain at sync time.
 *
 * Two-way (Phase 5): a Google edit to a BloomOS-owned block (extendedProperties
 * .private.bloomos_task_id) flows back to the task's planned_day; deleting the
 * block in Google unschedules the task (clears calendar_event_id, planned_day) —
 * it never deletes the task. BloomOS blocks are authoritative; imported google
 * events are read-only context.
 */

const TAG_KEY = "bloomos_task_id";

function bloomTaskId(e: calendar_v3.Schema$Event): string | null {
  const t = e.extendedProperties?.private?.[TAG_KEY];
  return typeof t === "string" && t ? t : null;
}

function eventStartIso(e: calendar_v3.Schema$Event): string | null {
  return e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00Z` : null);
}

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
  // Echo prevention: an event BloomOS wrote carries bloomos_task_id. Mark it
  // 'bloomos' so it's never re-ingested as a fresh external meeting, and so the
  // google stale-delete (source='google' only) never removes it.
  const isBloomOwned = !!e.extendedProperties?.private?.bloomos_task_id;
  return {
    org_id: conn.orgId,
    owner_user_id: conn.userId,
    google_event_id: e.id,
    // Instances of a recurring event (singleEvents: true) each get their own
    // google_event_id; recurringEventId is the stable series key they share.
    recurring_event_id: e.recurringEventId ?? null,
    calendar_id: conn.calendarId,
    title: e.summary ?? null,
    description: e.description ?? null,
    location: e.location ?? null,
    start_time: start.iso,
    end_time: end.iso,
    all_day: start.allDay,
    status: e.status ?? null,
    attendees,
    is_external: isBloomOwned ? false : isExternal,
    source: isBloomOwned ? "bloomos" : "google",
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

/** Fetch a page set: incrementally if we hold a syncToken, else a full window.
 *  An invalid/expired token (410) transparently falls back to a full sync. */
async function fetchEvents(
  cal: calendar_v3.Calendar,
  conn: GoogleCalendarConnection,
  window: { start: Date; end: Date }
): Promise<{ items: calendar_v3.Schema$Event[]; nextSyncToken: string | null; usedFull: boolean }> {
  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  if (conn.syncToken) {
    try {
      do {
        const res = await cal.events.list({
          calendarId: conn.calendarId,
          singleEvents: true,
          showDeleted: true, // incremental deltas include cancellations
          maxResults: PAGE_SIZE,
          pageToken,
          syncToken: conn.syncToken,
        });
        items.push(...(res.data.items ?? []));
        pageToken = res.data.nextPageToken ?? undefined;
        if (!pageToken) nextSyncToken = res.data.nextSyncToken ?? null;
      } while (pageToken);
      return { items, nextSyncToken, usedFull: false };
    } catch (e: unknown) {
      const status =
        (e as { code?: number; status?: number; response?: { status?: number } }).code ??
        (e as { status?: number }).status ??
        (e as { response?: { status?: number } }).response?.status;
      if (status !== 410) throw e; // only a GONE token is recoverable here
      items.length = 0;
      pageToken = undefined;
      nextSyncToken = null;
    }
  }

  // Full window sync (first run, or after a token reset).
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
    if (!pageToken) nextSyncToken = res.data.nextSyncToken ?? null;
  } while (pageToken);
  return { items, nextSyncToken, usedFull: true };
}

// A google event vanished (cancelled/deleted). If it was a BloomOS-owned block,
// unschedule its task first (flow-back) — never delete the task — then drop the
// mirror row. Plain google rows just drop.
async function handleDeleted(
  sb: SupabaseClient,
  conn: GoogleCalendarConnection,
  googleEventId: string
): Promise<boolean> {
  const { data: row } = await sb
    .from("calendar_events")
    .select("id, source")
    .eq("owner_user_id", conn.userId)
    .eq("google_event_id", googleEventId)
    .maybeSingle();
  const r = row as { id: string; source: string | null } | null;
  if (!r) return false;
  if (r.source === "bloomos") {
    await sb
      .from("ops_tasks")
      .update({ calendar_event_id: null, planned_day: null })
      .eq("calendar_event_id", r.id)
      .eq("org_id", conn.orgId);
  }
  await sb.from("calendar_events").delete().eq("id", r.id);
  return true;
}

/** Sync one user's calendar (incremental when possible). Returns counts. */
export async function syncUserCalendar(
  sb: SupabaseClient,
  conn: GoogleCalendarConnection,
  window: { start: Date; end: Date }
): Promise<SyncCounts> {
  const cal = calendarClientFromRefreshToken(conn.refreshToken);
  const { items, nextSyncToken, usedFull } = await fetchEvents(cal, conn, window);

  const domain = await orgDomain(sb, conn.orgId);
  const syncedAt = new Date().toISOString();

  const cancelled = items.filter((e) => e.id && e.status === "cancelled");
  const active = items.filter((e) => e.id && e.status !== "cancelled" && eventStartIso(e));

  // Upsert the live events.
  let upserted = 0;
  if (active.length) {
    const rows = active.map((e) => mapEvent(e, conn, domain, syncedAt));
    const { error } = await sb
      .from("calendar_events")
      .upsert(rows, { onConflict: "owner_user_id,google_event_id" });
    if (error) throw new Error(`calendar_events upsert failed: ${error.message}`);
    upserted = rows.length;
  }

  // Flow-back: a BloomOS block moved/resized in Google updates the task's day.
  for (const e of active) {
    const taskId = bloomTaskId(e);
    const startIso = eventStartIso(e);
    if (!taskId || !startIso) continue;
    const day = laDateOf(startIso);
    await sb
      .from("ops_tasks")
      .update({ planned_day: day, planned_week: mondayOf(day) })
      .eq("id", taskId)
      .eq("org_id", conn.orgId);
  }

  // Deletions reported in the delta (incremental) or implied by the window (full).
  let deleted = 0;
  for (const e of cancelled) {
    if (e.id && (await handleDeleted(sb, conn, e.id))) deleted += 1;
  }

  if (usedFull) {
    // Plain google rows in-window not touched this run are stale → drop.
    const { count } = await sb
      .from("calendar_events")
      .delete({ count: "exact" })
      .eq("owner_user_id", conn.userId)
      .eq("source", "google")
      .gte("start_time", window.start.toISOString())
      .lte("start_time", window.end.toISOString())
      .lt("synced_at", syncedAt);
    deleted += count ?? 0;

    // Reconcile BloomOS blocks deleted in Google (the stale-delete skips them).
    // Guard against the write race: a block BloomOS just wrote (Phase 4 sets the
    // mirror immediately) may not be in Google's list yet — only reconcile blocks
    // untouched for a few minutes so we never unschedule a brand-new one.
    const fetchedIds = new Set(active.map((e) => e.id as string));
    const graceCutoff = new Date(Date.parse(syncedAt) - 5 * 60_000).toISOString();
    const { data: bloomRows } = await sb
      .from("calendar_events")
      .select("google_event_id")
      .eq("owner_user_id", conn.userId)
      .eq("source", "bloomos")
      .lt("synced_at", graceCutoff)
      .gte("start_time", window.start.toISOString())
      .lte("start_time", window.end.toISOString());
    for (const b of (bloomRows ?? []) as Array<{ google_event_id: string | null }>) {
      if (b.google_event_id && !fetchedIds.has(b.google_event_id)) {
        if (await handleDeleted(sb, conn, b.google_event_id)) deleted += 1;
      }
    }
  }

  // Persist the incremental cursor for next run (best-effort).
  if (nextSyncToken && nextSyncToken !== conn.syncToken) {
    try {
      await updateConnectionMeta(conn.id, { sync_token: nextSyncToken });
    } catch (e) {
      console.error(`saving syncToken for user ${conn.userId} failed:`, e);
    }
  }

  return { fetched: items.length, upserted, deleted };
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
