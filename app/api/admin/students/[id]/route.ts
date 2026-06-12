import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const STAGES = [
  "discover", "learn", "practice", "connect", "launch", "alumni", "withdrawn",
] as const;
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

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
  if (STAGES.includes(body.stage as (typeof STAGES)[number])) update.stage = body.stage;
  for (const f of ["dob", "last_activity_at"] as const) {
    if (f in body) {
      if (body[f] === null || body[f] === "") update[f] = null;
      else if (isISODate(body[f])) update[f] = body[f];
    }
  }
  if (body.touch === true) update.last_activity_at = new Date().toISOString().slice(0, 10);
  for (const f of [
    "first_name", "last_name", "email", "phone", "grade", "school", "location",
    "guardian_name", "guardian_email", "guardian_phone", "notes",
  ] as const) {
    if (f in body) {
      if (body[f] === null || body[f] === "") {
        if (f !== "first_name") update[f] = null;
      } else if (typeof body[f] === "string") {
        update[f] = (body[f] as string).trim().slice(0, f === "notes" ? 2000 : 120);
      }
    }
  }
  if (typeof update.email === "string") update.email = update.email.toLowerCase();
  if (typeof update.guardian_email === "string")
    update.guardian_email = (update.guardian_email as string).toLowerCase();

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("students").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("students").update(update).eq("id", params.id);
  if (error) {
    console.error("Update student failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "stage" in update ? "program.student.stage" : "program.student.update",
    entityType: "student",
    entityId: params.id,
    before,
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
  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("students").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("students").delete().eq("id", params.id);
  if (error) {
    console.error("Delete student failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.student.delete",
    entityType: "student",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
