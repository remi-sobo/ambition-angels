import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { dayStartInstant } from "@/lib/admin/ops/week";
import {
  scheduleTaskBlock,
  moveTaskBlock,
  unscheduleTaskBlock,
  NoCalendarConnection,
} from "@/lib/agenda/task-blocks";

// Task ↔ calendar block writes (Phase 4). A "block" is a time window on a day:
// { day: YYYY-MM-DD, start_minute, duration_minute } in America/Los_Angeles,
// resolved to a UTC instant with the shared LA helper so the math matches the
// rest of the rhythm.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveWindow(
  body: Record<string, unknown> | null
): { day: string; start: Date; end: Date } | { error: string } {
  if (!body) return { error: "Invalid JSON body" };
  const day = typeof body.day === "string" ? body.day : "";
  const startMin = Number(body.start_minute);
  const durMin = Number(body.duration_minute);
  if (!DAY_RE.test(day)) return { error: "day must be YYYY-MM-DD" };
  if (!Number.isFinite(startMin) || startMin < 0 || startMin >= 1440) {
    return { error: "start_minute must be 0..1439" };
  }
  if (!Number.isFinite(durMin) || durMin <= 0 || durMin > 1440) {
    return { error: "duration_minute must be 1..1440" };
  }
  const midnight = new Date(dayStartInstant(day)).getTime();
  const start = new Date(midnight + startMin * 60_000);
  const end = new Date(midnight + (startMin + durMin) * 60_000);
  return { day, start, end };
}

// POST — schedule a task into a block.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const taskId = typeof body?.task_id === "string" ? body.task_id : "";
  if (!taskId) return NextResponse.json({ error: "task_id is required" }, { status: 400 });
  const win = resolveWindow(body);
  if ("error" in win) return NextResponse.json({ error: win.error }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: task } = await sb
    .from("ops_tasks")
    .select("id, title")
    .eq("id", taskId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  try {
    const res = await scheduleTaskBlock({
      userId: ctx.userId,
      orgId: ctx.orgId,
      taskId,
      title: (task as { title: string }).title,
      start: win.start,
      end: win.end,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    if (e instanceof NoCalendarConnection) {
      return NextResponse.json({ error: "Connect a Google Calendar first." }, { status: 409 });
    }
    console.error("[agenda/blocks POST] failed:", e);
    return NextResponse.json({ error: "Couldn't schedule the block" }, { status: 502 });
  }
}

// PATCH — move/resize an existing block.
export async function PATCH(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const taskId = typeof body?.task_id === "string" ? body.task_id : "";
  if (!taskId) return NextResponse.json({ error: "task_id is required" }, { status: 400 });
  const win = resolveWindow(body);
  if ("error" in win) return NextResponse.json({ error: win.error }, { status: 400 });

  try {
    await moveTaskBlock({ userId: ctx.userId, orgId: ctx.orgId, taskId, start: win.start, end: win.end });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NoCalendarConnection) {
      return NextResponse.json({ error: "Connect a Google Calendar first." }, { status: 409 });
    }
    console.error("[agenda/blocks PATCH] failed:", e);
    return NextResponse.json({ error: "Couldn't move the block" }, { status: 502 });
  }
}

// DELETE — unschedule (delete the block, keep the task).
export async function DELETE(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const taskId = new URL(req.url).searchParams.get("task_id") ?? "";
  if (!taskId) return NextResponse.json({ error: "task_id is required" }, { status: 400 });

  try {
    await unscheduleTaskBlock({ userId: ctx.userId, orgId: ctx.orgId, taskId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[agenda/blocks DELETE] failed:", e);
    return NextResponse.json({ error: "Couldn't unschedule the block" }, { status: 502 });
  }
}
