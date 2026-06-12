import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const STATUSES = ["todo", "doing", "done"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (STATUSES.includes(body.status as (typeof STATUSES)[number])) update.status = body.status;
  if (typeof body.title === "string" && body.title.trim())
    update.title = body.title.trim().slice(0, 300);
  if ("owner" in body)
    update.owner =
      body.owner === null || body.owner === ""
        ? null
        : typeof body.owner === "string"
        ? body.owner.trim().slice(0, 60)
        : undefined;
  if (update.owner === undefined) delete update.owner;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("plan_initiatives")
    .update(update)
    .eq("id", params.id);
  if (error) {
    console.error("Update initiative failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.initiative.update",
    entityType: "plan_initiative",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const { error } = await getSupabaseAdmin()
    .from("plan_initiatives")
    .delete()
    .eq("id", params.id);
  if (error) {
    console.error("Delete initiative failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.initiative.delete",
    entityType: "plan_initiative",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
