import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = body && typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  const goalId = isUuid(body?.goal_id) ? (body!.goal_id as string) : null;
  if (!title || !goalId) {
    return NextResponse.json({ error: "title and goal_id are required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // The initiative inherits its goal's org — and the goal must be in the
  // caller's org, so a cross-tenant goal_id can't be hijacked.
  const { data: goal } = await supabase
    .from("plan_goals").select("id").eq("id", goalId).eq("org_id", ctx.orgId).maybeSingle();
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  const insert: Record<string, unknown> = { title, goal_id: goalId, org_id: ctx.orgId };
  if (typeof body?.owner === "string" && body.owner.trim())
    insert.owner = body.owner.trim().slice(0, 60);
  if (typeof body?.description === "string" && body.description.trim())
    insert.description = body.description.trim().slice(0, 2000);

  const { data, error } = await supabase
    .from("plan_initiatives")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create initiative failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.initiative.create",
    entityType: "plan_initiative",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
