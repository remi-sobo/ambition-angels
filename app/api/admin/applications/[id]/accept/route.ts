import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Accept an application: create the student (or link an existing one by
// email match), enroll them in the application's cohort, and close the
// application out. One tap from "offered" to "on the roster".
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: app } = await supabase
    .from("applications").select("*").eq("id", params.id).maybeSingle();
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (app.status === "accepted") {
    return NextResponse.json({ error: "Already accepted" }, { status: 409 });
  }

  // Link an existing student if the family is already on the roster
  // (same dedupe rule as the career-quiz import: any email overlap).
  let studentId: string | null = app.student_id;
  if (!studentId) {
    const emails = [app.email, app.guardian_email]
      .filter((e): e is string => Boolean(e))
      .map((e) => e.toLowerCase());
    if (emails.length > 0) {
      const list = emails.map((e) => `"${e}"`).join(",");
      const { data: existing } = await supabase
        .from("students")
        .select("id")
        .or(`email.in.(${list}),guardian_email.in.(${list})`)
        .limit(1)
        .maybeSingle();
      if (existing) studentId = existing.id;
    }
  }

  if (!studentId) {
    const { data: created, error: createErr } = await supabase
      .from("students")
      .insert({
        org_id: app.org_id, // the application's org — never a column default
        first_name: app.first_name,
        last_name: app.last_name,
        email: app.email,
        phone: app.phone,
        dob: app.dob,
        grade: app.grade,
        school: app.school,
        location: app.location,
        stage: "learn",
        guardian_name: app.guardian_name,
        guardian_email: app.guardian_email,
        guardian_phone: app.guardian_phone,
        external_source: "application",
        external_id: app.id,
        last_activity_at: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (createErr || !created) {
      console.error("Accept: create student failed:", createErr?.message);
      return NextResponse.json({ error: "Could not create student" }, { status: 500 });
    }
    studentId = created.id;
  }

  if (app.cohort_id) {
    const { error: enrollErr } = await supabase
      .from("cohort_members")
      .upsert(
        { org_id: app.org_id, cohort_id: app.cohort_id, student_id: studentId, status: "enrolled" },
        { onConflict: "cohort_id,student_id" }
      );
    if (enrollErr) {
      console.error("Accept: enroll failed:", enrollErr.message);
      return NextResponse.json({ error: "Could not enroll student" }, { status: 500 });
    }
  }

  const { error: updateErr } = await supabase
    .from("applications")
    .update({
      status: "accepted",
      student_id: studentId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", params.id);
  if (updateErr) {
    console.error("Accept: close application failed:", updateErr.message);
    return NextResponse.json({ error: "Accept failed" }, { status: 500 });
  }

  await audit(req, {
    action: "program.application.accept",
    entityType: "application",
    entityId: params.id,
    before: app,
    after: { status: "accepted", student_id: studentId, cohort_id: app.cohort_id },
  });
  return NextResponse.json({ ok: true, student_id: studentId });
}
