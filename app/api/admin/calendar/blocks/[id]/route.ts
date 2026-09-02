import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import {
  BlockNotFound,
  deleteWorkBlock,
  moveWorkBlock,
  parseWindow,
  retitleWorkBlock,
} from "@/lib/agenda/work-blocks";

// Move/resize/retitle and delete for one work block. Ownership is enforced in
// the service (owner_user_id = session user), so a foreign id 404s.

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ctxHasPermission(ctx, "ops.write"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  try {
    let synced: boolean | undefined;
    if ("day" in body || "start_minute" in body || "duration_minute" in body) {
      const win = parseWindow(body);
      if ("error" in win) return NextResponse.json({ error: win.error }, { status: 400 });
      const res = await moveWorkBlock({
        userId: ctx.userId,
        orgId: ctx.orgId,
        blockId: params.id,
        day: win.day,
        startMinute: win.startMinute,
        durationMinute: win.durationMinute,
      });
      synced = res.synced;
    }
    if (typeof body.title === "string") {
      await retitleWorkBlock({
        userId: ctx.userId,
        orgId: ctx.orgId,
        blockId: params.id,
        title: body.title.slice(0, 200),
      });
    }
    return NextResponse.json({ ok: true, ...(synced !== undefined ? { synced } : {}) });
  } catch (e) {
    if (e instanceof BlockNotFound) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }
    console.error("[calendar/blocks PATCH] failed:", e);
    return NextResponse.json({ error: "Couldn't update the block" }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ctxHasPermission(ctx, "ops.write"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await deleteWorkBlock({ userId: ctx.userId, orgId: ctx.orgId, blockId: params.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof BlockNotFound) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }
    console.error("[calendar/blocks DELETE] failed:", e);
    return NextResponse.json({ error: "Couldn't delete the block" }, { status: 502 });
  }
}
