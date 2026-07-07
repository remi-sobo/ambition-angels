import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { resolveStaffAccess, isUuid, num, str } from "@/app/admin/staff/_lib/guard";

const METRIC_TYPES = new Set(["numeric", "milestone", "qualitative"]);
const STATUSES = new Set(["not_started", "on_track", "at_risk", "behind", "done"]);
const APPROVALS = new Set(["draft", "proposed", "approved"]);

// POST /api/admin/staff/:id/goals — create a goal for this person. Session client
// only; RLS ("write staff_goals" = can_view_staff) is the boundary and the
// approval trigger blocks a self-approve. Anyone who can view the person (self,
// a manager above, staff.manage) may add a goal.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const access = await resolveStaffAccess(params.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canView) return NextResponse.json({ error: "No access" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  const title = str(body.title, 300);
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  const metric_type = METRIC_TYPES.has(String(body.metric_type)) ? String(body.metric_type) : "qualitative";
  const status = STATUSES.has(String(body.status)) ? String(body.status) : "not_started";
  const approval_status = APPROVALS.has(String(body.approval_status))
    ? String(body.approval_status)
    : "draft";

  // If a plan-goal link is provided, confirm it's visible in this org (RLS read).
  let linked_plan_goal_id: string | null = null;
  if (isUuid(body.linked_plan_goal_id)) {
    const { data: pg } = await access.supabase
      .from("plan_goals")
      .select("id")
      .eq("id", body.linked_plan_goal_id as string)
      .eq("org_id", access.staff.org_id)
      .maybeSingle();
    linked_plan_goal_id = pg ? (body.linked_plan_goal_id as string) : null;
  }

  const insert = {
    org_id: access.staff.org_id,
    staff_id: access.staff.id,
    title,
    description: str(body.description),
    metric_type,
    target_value: num(body.target_value),
    current_value: num(body.current_value),
    unit: str(body.unit, 40),
    period: str(body.period, 40),
    target_date: str(body.target_date, 10),
    linked_plan_goal_id,
    status,
    approval_status,
  };

  const { data, error } = await access.supabase
    .from("staff_goals")
    .insert(insert)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await audit(req, {
    action: "staff.goal.create",
    entityType: "staff_goals",
    entityId: data.id,
    after: { staff_id: access.staff.id, title },
  });
  return NextResponse.json({ ok: true, goal: data });
}
