import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = body && typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  const objectiveId = isUuid(body?.objective_id) ? (body!.objective_id as string) : null;
  if (!title || !objectiveId) {
    return NextResponse.json({ error: "title and objective_id are required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // The task inherits its objective's org — and the objective must be in the
  // caller's org, so a cross-tenant objective_id can't be hijacked.
  const { data: objective } = await supabase
    .from("plan_objectives").select("id").eq("id", objectiveId).eq("org_id", ctx.orgId).maybeSingle();
  if (!objective) return NextResponse.json({ error: "Objective not found" }, { status: 404 });

  const insert: Record<string, unknown> = { title, objective_id: objectiveId, org_id: ctx.orgId };
  if (typeof body?.assignee === "string" && body.assignee.trim())
    insert.assignee = body.assignee.trim().slice(0, 60);
  if (isIsoDate(body?.due_date)) insert.due_date = body!.due_date;

  const { data, error } = await supabase
    .from("plan_objective_tasks")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create objective task failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.objective_task.create",
    entityType: "plan_objective_task",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
