import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getActiveCalendarConnection,
  calendarClientFromRefreshToken,
} from "@/lib/google/connection";
import { dayStartInstant, laDateOf, mondayOf, ORG_TZ } from "@/lib/admin/ops/week";

/**
 * Work-block writes (Calendar & Time Blocking, Phase 3) — the block is the
 * container: one work_blocks row, one Google event, several tasks.
 *
 * Google is mirror, BloomOS is authoritative: every write lands in
 * work_blocks first; the Google event (tagged extendedProperties.private
 * .bloomos_block_id) and the calendar_events mirror row follow best-effort,
 * so a user without a connected calendar still gets a working local grid
 * (their blocks just carry synced=false). Deleting a block never deletes a
 * task — linked tasks are unscheduled (planned_day cleared), exactly like the
 * single-task path before it.
 *
 * All functions run on the service-role client; callers (the /api/admin/
 * calendar routes) must pass the session's userId/orgId and have asserted
 * ops.write — every query here still filters owner_user_id + org_id so a
 * spoofed id reads nothing.
 */

const TAG_KEY = "bloomos_block_id";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate the shared block-window contract from a route body. */
export function parseWindow(body: Record<string, unknown> | null):
  | { day: string; startMinute: number; durationMinute: number }
  | { error: string } {
  if (!body) return { error: "Invalid JSON body" };
  const day = typeof body.day === "string" ? body.day : "";
  const startMinute = Number(body.start_minute);
  const durationMinute = Number(body.duration_minute);
  if (!DAY_RE.test(day)) return { error: "day must be YYYY-MM-DD" };
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute >= 1440) {
    return { error: "start_minute must be 0..1439" };
  }
  if (!Number.isInteger(durationMinute) || durationMinute <= 0 || durationMinute > 1440) {
    return { error: "duration_minute must be 1..1440" };
  }
  return { day, startMinute, durationMinute };
}

export type WorkBlockRow = {
  id: string;
  day: string;
  start_minute: number;
  duration_minute: number;
  title: string;
  google_event_id: string | null;
  calendar_event_id: string | null;
};

function blockWindow(day: string, startMinute: number, durationMinute: number): {
  start: Date;
  end: Date;
} {
  const midnight = Date.parse(dayStartInstant(day));
  return {
    start: new Date(midnight + startMinute * 60_000),
    end: new Date(midnight + (startMinute + durationMinute) * 60_000),
  };
}

async function getOwnedBlock(
  orgId: string,
  userId: string,
  blockId: string
): Promise<WorkBlockRow | null> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("work_blocks")
    .select("id, day, start_minute, duration_minute, title, google_event_id, calendar_event_id")
    .eq("id", blockId)
    .eq("org_id", orgId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  return (data as WorkBlockRow | null) ?? null;
}

async function writeMirrorRow(args: {
  orgId: string;
  userId: string;
  calendarId: string;
  googleEventId: string;
  title: string;
  start: Date;
  end: Date;
}): Promise<string | null> {
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
  if (error || !data) {
    console.error("[work-blocks] mirror write failed:", error?.message);
    return null;
  }
  return (data as { id: string }).id;
}

/** Stamp the linked tasks' planning fields to the block's day. */
async function restampLinkedTasks(orgId: string, blockId: string, day: string | null) {
  const sb = getSupabaseAdmin();
  const { data: links } = await sb
    .from("work_block_tasks")
    .select("task_id")
    .eq("block_id", blockId);
  const taskIds = (links ?? []).map((l) => l.task_id as string);
  if (taskIds.length === 0) return;
  const patch =
    day === null
      ? { planned_day: null }
      : { planned_day: day, planned_week: mondayOf(day) };
  await sb.from("ops_tasks").update(patch).in("id", taskIds).eq("org_id", orgId);
}

export type BlockWriteResult = { block: WorkBlockRow; synced: boolean };

export async function createWorkBlock(args: {
  userId: string;
  orgId: string;
  day: string;
  startMinute: number;
  durationMinute: number;
  title?: string;
}): Promise<BlockWriteResult> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("work_blocks")
    .insert({
      org_id: args.orgId,
      owner_user_id: args.userId,
      day: args.day,
      start_minute: args.startMinute,
      duration_minute: args.durationMinute,
      title: args.title?.trim() || "Work block",
    })
    .select("id, day, start_minute, duration_minute, title, google_event_id, calendar_event_id")
    .single();
  if (error || !data) throw new Error(`work_blocks insert failed: ${error?.message}`);
  const block = data as WorkBlockRow;

  // Google mirror, best-effort: no connection or an API failure leaves a
  // local-only block (synced=false) rather than failing the create.
  let synced = false;
  try {
    const conn = await getActiveCalendarConnection(args.userId);
    if (conn) {
      const { start, end } = blockWindow(block.day, block.start_minute, block.duration_minute);
      const cal = calendarClientFromRefreshToken(conn.refreshToken);
      const res = await cal.events.insert({
        calendarId: conn.calendarId,
        sendUpdates: "none",
        requestBody: {
          summary: block.title,
          start: { dateTime: start.toISOString(), timeZone: ORG_TZ },
          end: { dateTime: end.toISOString(), timeZone: ORG_TZ },
          extendedProperties: { private: { [TAG_KEY]: block.id } },
        },
      });
      const eventId = res.data.id;
      if (eventId) {
        const mirrorId = await writeMirrorRow({
          orgId: args.orgId,
          userId: args.userId,
          calendarId: conn.calendarId,
          googleEventId: eventId,
          title: block.title,
          start,
          end,
        });
        await sb
          .from("work_blocks")
          .update({ google_event_id: eventId, calendar_event_id: mirrorId })
          .eq("id", block.id);
        block.google_event_id = eventId;
        block.calendar_event_id = mirrorId;
        synced = true;
      }
    }
  } catch (e) {
    console.error("[work-blocks] Google create failed (block kept local):", e);
  }

  return { block, synced };
}

export async function moveWorkBlock(args: {
  userId: string;
  orgId: string;
  blockId: string;
  day: string;
  startMinute: number;
  durationMinute: number;
}): Promise<BlockWriteResult> {
  const block = await getOwnedBlock(args.orgId, args.userId, args.blockId);
  if (!block) throw new BlockNotFound();
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();
  await sb
    .from("work_blocks")
    .update({
      day: args.day,
      start_minute: args.startMinute,
      duration_minute: args.durationMinute,
      updated_at: now,
    })
    .eq("id", block.id);

  const dayChanged = args.day !== block.day;
  if (dayChanged) await restampLinkedTasks(args.orgId, block.id, args.day);

  let synced = !!block.google_event_id;
  if (block.google_event_id) {
    try {
      const conn = await getActiveCalendarConnection(args.userId);
      if (conn) {
        const { start, end } = blockWindow(args.day, args.startMinute, args.durationMinute);
        const cal = calendarClientFromRefreshToken(conn.refreshToken);
        await cal.events.patch({
          calendarId: conn.calendarId,
          eventId: block.google_event_id,
          sendUpdates: "none",
          requestBody: {
            start: { dateTime: start.toISOString(), timeZone: ORG_TZ },
            end: { dateTime: end.toISOString(), timeZone: ORG_TZ },
          },
        });
        if (block.calendar_event_id) {
          await sb
            .from("calendar_events")
            .update({
              start_time: start.toISOString(),
              end_time: end.toISOString(),
              updated_at: now,
              synced_at: now,
            })
            .eq("id", block.calendar_event_id);
        }
      }
    } catch (e) {
      console.error("[work-blocks] Google move failed (local move kept):", e);
      synced = false;
    }
  }

  return {
    block: {
      ...block,
      day: args.day,
      start_minute: args.startMinute,
      duration_minute: args.durationMinute,
    },
    synced,
  };
}

export async function retitleWorkBlock(args: {
  userId: string;
  orgId: string;
  blockId: string;
  title: string;
}): Promise<void> {
  const block = await getOwnedBlock(args.orgId, args.userId, args.blockId);
  if (!block) throw new BlockNotFound();
  const title = args.title.trim() || "Work block";
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();
  await sb.from("work_blocks").update({ title, updated_at: now }).eq("id", block.id);
  if (block.google_event_id) {
    try {
      const conn = await getActiveCalendarConnection(args.userId);
      if (conn) {
        const cal = calendarClientFromRefreshToken(conn.refreshToken);
        await cal.events.patch({
          calendarId: conn.calendarId,
          eventId: block.google_event_id,
          sendUpdates: "none",
          requestBody: { summary: title },
        });
      }
      if (block.calendar_event_id) {
        await sb
          .from("calendar_events")
          .update({ title, updated_at: now, synced_at: now })
          .eq("id", block.calendar_event_id);
      }
    } catch (e) {
      console.error("[work-blocks] Google retitle failed (local title kept):", e);
    }
  }
}

export async function deleteWorkBlock(args: {
  userId: string;
  orgId: string;
  blockId: string;
}): Promise<void> {
  const block = await getOwnedBlock(args.orgId, args.userId, args.blockId);
  if (!block) throw new BlockNotFound();
  const sb = getSupabaseAdmin();

  // Unschedule the tasks first (never delete them), then drop the block —
  // the FK cascade clears the links.
  await restampLinkedTasks(args.orgId, block.id, null);

  if (block.google_event_id) {
    try {
      const conn = await getActiveCalendarConnection(args.userId);
      if (conn) {
        const cal = calendarClientFromRefreshToken(conn.refreshToken);
        try {
          await cal.events.delete({
            calendarId: conn.calendarId,
            eventId: block.google_event_id,
            sendUpdates: "none",
          });
        } catch (err: unknown) {
          const status =
            (err as { code?: number; status?: number }).code ??
            (err as { code?: number; status?: number }).status;
          if (status !== 404 && status !== 410) throw err; // already gone is fine
        }
      }
    } catch (e) {
      console.error("[work-blocks] Google delete failed (local delete proceeds):", e);
    }
  }
  if (block.calendar_event_id) {
    await sb.from("calendar_events").delete().eq("id", block.calendar_event_id);
  }
  await sb.from("work_blocks").delete().eq("id", block.id);
}

export class BlockNotFound extends Error {
  constructor() {
    super("Work block not found");
    this.name = "BlockNotFound";
  }
}

export class TaskNotFound extends Error {
  constructor() {
    super("Task not found");
    this.name = "TaskNotFound";
  }
}

/**
 * Put a task on a block. One home at a time: the upsert on task_id moves the
 * task if it already sits on another block. Stamps the rhythm fields so the
 * planner and the grid agree on where the task lives.
 */
export async function addTaskToBlock(args: {
  userId: string;
  orgId: string;
  blockId: string;
  taskId: string;
}): Promise<void> {
  const block = await getOwnedBlock(args.orgId, args.userId, args.blockId);
  if (!block) throw new BlockNotFound();
  const sb = getSupabaseAdmin();

  const { data: task } = await sb
    .from("ops_tasks")
    .select("id")
    .eq("id", args.taskId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (!task) throw new TaskNotFound();

  const { data: last } = await sb
    .from("work_block_tasks")
    .select("position")
    .eq("block_id", block.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last?.position as number | undefined) ?? -1) + 1;

  const { error } = await sb.from("work_block_tasks").upsert(
    {
      org_id: args.orgId,
      block_id: block.id,
      task_id: args.taskId,
      position,
    },
    { onConflict: "task_id" }
  );
  if (error) throw new Error(`work_block_tasks upsert failed: ${error.message}`);

  await sb
    .from("ops_tasks")
    .update({
      planned_day: block.day,
      planned_week: mondayOf(block.day),
      pinned_for_this_week: true,
    })
    .eq("id", args.taskId)
    .eq("org_id", args.orgId);
}

/** Take a task off its block: the link goes, the task stays (day cleared). */
export async function removeTaskFromBlock(args: {
  userId: string;
  orgId: string;
  taskId: string;
}): Promise<void> {
  const sb = getSupabaseAdmin();
  // Only links whose block the caller owns are removable through this path.
  const { data: link } = await sb
    .from("work_block_tasks")
    .select("id, block_id, work_blocks(owner_user_id, org_id)")
    .eq("task_id", args.taskId)
    .maybeSingle();
  if (!link) return; // nothing to remove
  const parent = (Array.isArray(link.work_blocks) ? link.work_blocks[0] : link.work_blocks) as {
    owner_user_id: string;
    org_id: string;
  } | null;
  if (!parent || parent.owner_user_id !== args.userId || parent.org_id !== args.orgId) {
    throw new BlockNotFound();
  }
  await sb.from("work_block_tasks").delete().eq("id", link.id as string);
  await sb
    .from("ops_tasks")
    .update({ planned_day: null })
    .eq("id", args.taskId)
    .eq("org_id", args.orgId);
}

/** The tag the sync engine uses to recognize block events (flow-back). */
export const WORK_BLOCK_TAG_KEY = TAG_KEY;

/** Recompute a block's window from a Google event's instants (flow-back). */
export function blockPatchFromInstants(startISO: string, endISO: string | null): {
  day: string;
  start_minute: number;
  duration_minute: number;
} {
  const day = laDateOf(startISO);
  const midnight = Date.parse(dayStartInstant(day));
  const startMin = Math.max(
    0,
    Math.min(1439, Math.round((Date.parse(startISO) - midnight) / 60_000))
  );
  const endMs = endISO ? Date.parse(endISO) : Date.parse(startISO) + 30 * 60_000;
  const durMin = Math.max(
    15,
    Math.min(1440 - startMin, Math.round((endMs - Date.parse(startISO)) / 60_000))
  );
  return { day, start_minute: startMin, duration_minute: durMin };
}
