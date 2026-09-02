import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { createWorkBlock, parseWindow } from "@/lib/agenda/work-blocks";

// Work-block create (Calendar & Time Blocking, Phase 3). Same window contract
// as the rest of the rhythm: { day: YYYY-MM-DD, start_minute, duration_minute }
// in the org timezone. Runs on the service path, so the ops.write gate is
// re-asserted here (service-role discipline); ownership is always the session
// user — nobody blocks time on someone else's calendar.

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ctxHasPermission(ctx, "ops.write"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const win = parseWindow(body);
  if ("error" in win) return NextResponse.json({ error: win.error }, { status: 400 });
  const title = typeof body?.title === "string" ? body.title.slice(0, 200) : undefined;

  try {
    const res = await createWorkBlock({
      userId: ctx.userId,
      orgId: ctx.orgId,
      day: win.day,
      startMinute: win.startMinute,
      durationMinute: win.durationMinute,
      title,
    });
    return NextResponse.json({ ok: true, block: res.block, synced: res.synced });
  } catch (e) {
    console.error("[calendar/blocks POST] failed:", e);
    return NextResponse.json({ error: "Couldn't create the block" }, { status: 502 });
  }
}
