import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const SOURCES = ["auto", "manual"] as const;
const STATUSES = ["not_started", "on_track", "at_risk", "behind", "done"] as const;
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = body && typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  const goalId = isUuid(body?.goal_id) ? (body!.goal_id as string) : null;
  const objectiveId = isUuid(body?.objective_id) ? (body!.objective_id as string) : null;
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!goalId && !objectiveId) {
    return NextResponse.json({ error: "Attach to a goal or an objective" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // Both parents must live in the caller's org — guards against attaching a
  // KPI to another tenant's goal/objective on the RLS-bypassing client.
  if (goalId) {
    const { data } = await supabase
      .from("plan_goals").select("id").eq("id", goalId).eq("org_id", ctx.orgId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }
  if (objectiveId) {
    const { data } = await supabase
      .from("plan_objectives").select("id").eq("id", objectiveId).eq("org_id", ctx.orgId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Objective not found" }, { status: 404 });
  }

  const insert: Record<string, unknown> = { title, org_id: ctx.orgId };
  if (goalId) insert.goal_id = goalId;
  if (objectiveId) insert.objective_id = objectiveId;
  if (typeof body?.unit === "string" && body.unit.trim()) insert.unit = body.unit.trim().slice(0, 40);
  if (typeof body?.owner === "string" && body.owner.trim()) insert.owner = body.owner.trim().slice(0, 60);
  if (typeof body?.cadence === "string" && body.cadence.trim()) insert.cadence = body.cadence.trim().slice(0, 40);
  if (typeof body?.metric_key === "string" && body.metric_key.trim())
    insert.metric_key = body.metric_key.trim().slice(0, 80);
  if (num(body?.target) !== undefined) insert.target = num(body?.target);
  if (num(body?.current) !== undefined) {
    insert.current = num(body?.current);
    insert.last_updated_at = new Date().toISOString();
  }
  if (SOURCES.includes(body?.source as (typeof SOURCES)[number])) insert.source = body!.source;
  if (STATUSES.includes(body?.status as (typeof STATUSES)[number])) insert.status = body!.status;

  const { data, error } = await supabase
    .from("plan_kpis")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create KPI failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.kpi.create",
    entityType: "plan_kpi",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
