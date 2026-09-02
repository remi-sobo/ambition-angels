import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import {
  addTaskToBlock,
  BlockNotFound,
  removeTaskFromBlock,
  TaskNotFound,
} from "@/lib/agenda/work-blocks";

// Fill-the-block: put a task on a block (POST — an upsert, so a task already
// on another block MOVES here) or take it off (DELETE — the task survives,
// its planned_day clears). Completion is NOT here: checkboxes go through the
// existing /api/admin/ops/tasks/[id] PATCH so recurrence and every other
// surface behave identically.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ctxHasPermission(ctx, "ops.write"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const taskId = typeof body?.task_id === "string" ? body.task_id : "";
  if (!taskId) return NextResponse.json({ error: "task_id is required" }, { status: 400 });

  try {
    await addTaskToBlock({ userId: ctx.userId, orgId: ctx.orgId, blockId: params.id, taskId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof BlockNotFound) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }
    if (e instanceof TaskNotFound) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    console.error("[calendar/blocks/tasks POST] failed:", e);
    return NextResponse.json({ error: "Couldn't add the task" }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ctxHasPermission(ctx, "ops.write"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const taskId = new URL(req.url).searchParams.get("task_id") ?? "";
  if (!taskId) return NextResponse.json({ error: "task_id is required" }, { status: 400 });

  try {
    await removeTaskFromBlock({ userId: ctx.userId, orgId: ctx.orgId, taskId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof BlockNotFound) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }
    console.error("[calendar/blocks/tasks DELETE] failed:", e);
    return NextResponse.json({ error: "Couldn't remove the task" }, { status: 502 });
  }
}
