import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const STAGES = [
  "discover", "learn", "practice", "connect", "launch", "alumni", "withdrawn",
] as const;

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const firstName =
    body && typeof body.first_name === "string" ? body.first_name.trim().slice(0, 120) : "";
  if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 });

  const insert: Record<string, unknown> = { first_name: firstName };
  if (STAGES.includes(body?.stage as (typeof STAGES)[number])) insert.stage = body!.stage;
  if (typeof body?.email === "string" && body.email.includes("@"))
    insert.email = body.email.trim().toLowerCase();
  for (const f of ["last_name", "grade", "school", "guardian_name", "guardian_phone"] as const) {
    if (typeof body?.[f] === "string" && (body[f] as string).trim())
      insert[f] = (body[f] as string).trim().slice(0, 120);
  }
  if (typeof body?.guardian_email === "string" && body.guardian_email.includes("@"))
    insert.guardian_email = body.guardian_email.trim().toLowerCase();

  const { data, error } = await getSupabaseAdmin()
    .from("students")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create student failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.student.create",
    entityType: "student",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
