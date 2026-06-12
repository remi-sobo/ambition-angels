import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = body && typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const insert: Record<string, unknown> = { title };
  if (typeof body?.description === "string" && body.description.trim())
    insert.description = body.description.trim().slice(0, 2000);
  if (isISODate(body?.target_date)) insert.target_date = body!.target_date;

  const { data, error } = await getSupabaseAdmin()
    .from("plan_goals")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create goal failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.goal.create",
    entityType: "plan_goal",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
