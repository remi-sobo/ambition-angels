import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { resolveStaffAccess, isUuid, num, str } from "@/app/admin/staff/_lib/guard";

const STATUSES = new Set(["not_started", "on_track", "at_risk", "behind", "done"]);
const APPROVALS = new Set(["draft", "proposed", "approved"]);

// PATCH /api/admin/staff/:id/goals/:goalId — edit a goal. The DB approval trigger
// blocks a subject from self-approving; everything else is open to anyone who can
// view the person. DELETE removes the goal.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; goalId: string } }
) {
  if (!isUuid(params.id) || !isUuid(params.goalId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const access = await resolveStaffAccess(params.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canView) return NextResponse.json({ error: "No access" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected JSON" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("title" in body) {
    const t = str(body.title, 300);
    if (!t) return NextResponse.json({ error: "Title can't be empty." }, { status: 400 });
    patch.title = t;
  }
  if ("description" in body) patch.description = str(body.description);
  if ("target_value" in body) patch.target_value = num(body.target_value);
  if ("current_value" in body) patch.current_value = num(body.current_value);
  if ("unit" in body) patch.unit = str(body.unit, 40);
  if ("period" in body) patch.period = str(body.period, 40);
  if ("target_date" in body) patch.target_date = str(body.target_date, 10);
  if ("status" in body && STATUSES.has(String(body.status))) patch.status = String(body.status);
  if ("approval_status" in body && APPROVALS.has(String(body.approval_status))) {
    patch.approval_status = String(body.approval_status);
  }
  if ("sort_order" in body) patch.sort_order = num(body.sort_order) ?? 0;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await access.supabase
    .from("staff_goals")
    .update(patch)
    .eq("id", params.goalId)
    .eq("staff_id", access.staff.id)
    .select("*")
    .maybeSingle();
  if (error) {
    // The approval trigger raises when a subject tries to self-approve.
    const denied = /only a manager can approve/i.test(error.message);
    return NextResponse.json({ error: error.message }, { status: denied ? 403 : 400 });
  }
  if (!data) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  await audit(req, {
    action: "staff.goal.update",
    entityType: "staff_goals",
    entityId: params.goalId,
    after: patch,
  });
  return NextResponse.json({ ok: true, goal: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; goalId: string } }
) {
  if (!isUuid(params.id) || !isUuid(params.goalId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const access = await resolveStaffAccess(params.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canView) return NextResponse.json({ error: "No access" }, { status: 403 });

  const { error } = await access.supabase
    .from("staff_goals")
    .delete()
    .eq("id", params.goalId)
    .eq("staff_id", access.staff.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await audit(req, {
    action: "staff.goal.delete",
    entityType: "staff_goals",
    entityId: params.goalId,
  });
  return NextResponse.json({ ok: true });
}
