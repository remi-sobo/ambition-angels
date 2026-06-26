import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getActiveCalendarConnection,
  calendarClientFromRefreshToken,
} from "@/lib/google/connection";
import { mondayOf, laDateOf, ORG_TZ } from "@/lib/admin/ops/week";

/**
 * Task → calendar block writes (BloomOS Agenda Phase 4), one-way and tagged.
 *
 * Dragging a planned task into an open block writes a Google event on the user's
 * OWN calendar (per-user connection, not the env account), tagged with
 * extendedProperties.private.bloomos_task_id for echo prevention. BloomOS also
 * upserts the calendar_events mirror row immediately (source='bloomos') and links
 * it on ops_tasks.calendar_event_id, so the grid and link don't wait for the
 * next 15-minute sync. BloomOS-owned blocks are authoritative; imported google
 * events are read-only context. Unscheduling clears the link, never the task.
 */

const TAG_KEY = "bloomos_task_id";

export class NoCalendarConnection extends Error {
  constructor() {
    super("No active Google Calendar connection for this user");
    this.name = "NoCalendarConnection";
  }
}

type ScheduleArgs = {
  userId: string;
  orgId: string;
  taskId: string;
  title: string;
  start: Date;
  end: Date;
};

async function writeMirrorRow(args: {
  orgId: string;
  userId: string;
  calendarId: string;
  googleEventId: string;
  title: string;
  start: Date;
  end: Date;
}): Promise<string> {
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("calendar_events")
    .upsert(
      {
        org_id: args.orgId,
        owner_user_id: args.userId,
        google_event_id: args.googleEventId,
        calendar_id: args.calendarId,
        title: args.title,
        start_time: args.start.toISOString(),
        end_time: args.end.toISOString(),
        all_day: false,
        status: "confirmed",
        attendees: [],
        is_external: false,
        source: "bloomos",
        synced_at: now,
        updated_at: now,
      },
      { onConflict: "owner_user_id,google_event_id" }
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`calendar_events mirror write failed: ${error?.message}`);
  return (data as { id: string }).id;
}

/** Schedule a task into a calendar block: tagged Google event + mirror + link. */
export async function scheduleTaskBlock(args: ScheduleArgs): Promise<{
  eventId: string;
  calendarEventId: string;
}> {
  const conn = await getActiveCalendarConnection(args.userId);
  if (!conn) throw new NoCalendarConnection();
  const cal = calendarClientFromRefreshToken(conn.refreshToken);

  const res = await cal.events.insert({
    calendarId: conn.calendarId,
    sendUpdates: "none", // internal time-block, no attendees to notify
    requestBody: {
      summary: args.title,
      start: { dateTime: args.start.toISOString(), timeZone: ORG_TZ },
      end: { dateTime: args.end.toISOString(), timeZone: ORG_TZ },
      extendedProperties: { private: { [TAG_KEY]: args.taskId } },
    },
  });
  const eventId = res.data.id;
  if (!eventId) throw new Error("Google Calendar: event created but no id returned");

  const calendarEventId = await writeMirrorRow({
    orgId: args.orgId,
    userId: args.userId,
    calendarId: conn.calendarId,
    googleEventId: eventId,
    title: args.title,
    start: args.start,
    end: args.end,
  });

  const dayISO = laDateOf(args.start);
  const sb = getSupabaseAdmin();
  await sb
    .from("ops_tasks")
    .update({
      calendar_event_id: calendarEventId,
      planned_day: dayISO,
      planned_week: mondayOf(dayISO),
      pinned_for_this_week: true,
    })
    .eq("id", args.taskId)
    .eq("org_id", args.orgId);

  return { eventId, calendarEventId };
}

type BlockRef = { googleEventId: string; calendarEventId: string; calendarId: string };

// Resolve the task's linked block (its calendar_events mirror row + google id).
async function resolveBlock(orgId: string, taskId: string): Promise<BlockRef | null> {
  const sb = getSupabaseAdmin();
  const { data: task } = await sb
    .from("ops_tasks")
    .select("calendar_event_id")
    .eq("id", taskId)
    .eq("org_id", orgId)
    .maybeSingle();
  const calendarEventId = (task as { calendar_event_id: string | null } | null)?.calendar_event_id;
  if (!calendarEventId) return null;
  const { data: ev } = await sb
    .from("calendar_events")
    .select("google_event_id, calendar_id")
    .eq("id", calendarEventId)
    .maybeSingle();
  const row = ev as { google_event_id: string | null; calendar_id: string | null } | null;
  if (!row?.google_event_id) return null;
  return { googleEventId: row.google_event_id, calendarEventId, calendarId: row.calendar_id ?? "primary" };
}

/** Move/resize a scheduled block: patch Google + mirror + the task's day. */
export async function moveTaskBlock(args: {
  userId: string;
  orgId: string;
  taskId: string;
  start: Date;
  end: Date;
}): Promise<void> {
  const conn = await getActiveCalendarConnection(args.userId);
  if (!conn) throw new NoCalendarConnection();
  const block = await resolveBlock(args.orgId, args.taskId);
  if (!block) throw new Error("Task is not scheduled on the calendar");

  const cal = calendarClientFromRefreshToken(conn.refreshToken);
  await cal.events.patch({
    calendarId: block.calendarId,
    eventId: block.googleEventId,
    sendUpdates: "none",
    requestBody: {
      start: { dateTime: args.start.toISOString(), timeZone: ORG_TZ },
      end: { dateTime: args.end.toISOString(), timeZone: ORG_TZ },
    },
  });

  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();
  await sb
    .from("calendar_events")
    .update({ start_time: args.start.toISOString(), end_time: args.end.toISOString(), updated_at: now, synced_at: now })
    .eq("id", block.calendarEventId);
  await sb
    .from("ops_tasks")
    .update({ planned_day: laDateOf(args.start), planned_week: mondayOf(laDateOf(args.start)) })
    .eq("id", args.taskId)
    .eq("org_id", args.orgId);
}

/** Unschedule: delete the Google block + mirror, clear the link (keep the task). */
export async function unscheduleTaskBlock(args: {
  userId: string;
  orgId: string;
  taskId: string;
}): Promise<void> {
  const conn = await getActiveCalendarConnection(args.userId);
  const block = await resolveBlock(args.orgId, args.taskId);

  if (block && conn) {
    const cal = calendarClientFromRefreshToken(conn.refreshToken);
    try {
      await cal.events.delete({ calendarId: block.calendarId, eventId: block.googleEventId, sendUpdates: "none" });
    } catch (err: unknown) {
      const status = (err as { code?: number; status?: number }).code ?? (err as { code?: number; status?: number }).status;
      if (status !== 404 && status !== 410) throw err; // already gone is fine
    }
  }

  const sb = getSupabaseAdmin();
  // Clear the link first (FK is on delete set null, but be explicit + clear the day).
  await sb
    .from("ops_tasks")
    .update({ calendar_event_id: null, planned_day: null })
    .eq("id", args.taskId)
    .eq("org_id", args.orgId);
  if (block) {
    await sb.from("calendar_events").delete().eq("id", block.calendarEventId);
  }
}
