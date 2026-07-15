import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const STATUSES = ["todo", "done"] as const;
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim())
    update.title = body.title.trim().slice(0, 300);
  if (STATUSES.includes(body.status as (typeof STATUSES)[number])) update.status = body.status;
  if ("assignee" in body)
    update.assignee =
      body.assignee === null || body.assignee === ""
        ? null
        : typeof body.assignee === "string"
        ? body.assignee.trim().slice(0, 60)
        : undefined;
  if (update.assignee === undefined) delete update.assignee;
  if ("due_date" in body) {
    if (body.due_date === null || body.due_date === "") update.due_date = null;
    else if (isIsoDate(body.due_date)) update.due_date = body.due_date;
  }
  if (typeof body.sort_order === "number" && Number.isFinite(body.sort_order))
    update.sort_order = Math.trunc(body.sort_order);
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("plan_objective_tasks").select("*").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("plan_objective_tasks").update(update).eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) {
    console.error("Update objective task failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.objective_task.update",
    entityType: "plan_objective_task",
    entityId: params.id,
    before,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("plan_objective_tasks").select("*").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("plan_objective_tasks").delete().eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) {
    console.error("Delete objective task failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.objective_task.delete",
    entityType: "plan_objective_task",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
