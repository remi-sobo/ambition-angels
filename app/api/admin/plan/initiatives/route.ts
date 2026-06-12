import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = body && typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  const goalId =
    body && typeof body.goal_id === "string" && /^[0-9a-f-]{36}$/i.test(body.goal_id)
      ? body.goal_id
      : null;
  if (!title || !goalId) {
    return NextResponse.json({ error: "title and goal_id are required" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("plan_initiatives")
    .insert({ title, goal_id: goalId })
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
    after: { title, goal_id: goalId },
  });
  return NextResponse.json({ id: data.id });
}
