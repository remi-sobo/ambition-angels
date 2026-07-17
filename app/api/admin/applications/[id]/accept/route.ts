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
  // (same dedupe rule as the career-quiz import: any email overlap). Guardian
  // email is a custom field now (D5), so match in JS over the org's roster
  // rather than a fragile JSONB `.or()` filter — the table is small and a miss
  // here would wrongly create a duplicate student.
  let studentId: string | null = app.student_id;
  if (!studentId) {
    const emails = new Set(
      [app.email, app.guardian_email]
        .filter((e): e is string => Boolean(e))
        .map((e) => e.toLowerCase())
    );
    if (emails.size > 0) {
      const { data: roster } = await supabase
        .from("students")
        .select("id, email, custom_fields")
        .eq("org_id", app.org_id);
      const match = (roster ?? []).find((r) => {
        const rowEmail = typeof r.email === "string" ? r.email.toLowerCase() : null;
        const guardian = (r.custom_fields as Record<string, unknown> | null)?.guardian_email;
        const rowGuardian = typeof guardian === "string" ? guardian.toLowerCase() : null;
        return (rowEmail && emails.has(rowEmail)) || (rowGuardian && emails.has(rowGuardian));
      });
      if (match) studentId = match.id;
    }
  }

  if (!studentId) {
    // The application's AA-shaped participant fields map to the student's
    // custom_fields registry keys (the AA defs seeded in D2); the AA-specific
    // student columns were dropped in D5. Only carry keys that have a value.
    const customFields: Record<string, unknown> = {};
    for (const k of ["grade", "school", "dob", "guardian_name", "guardian_email", "guardian_phone"] as const) {
      const v = (app as Record<string, unknown>)[k];
      if (v !== null && v !== undefined && v !== "") customFields[k] = v;
    }
    const { data: created, error: createErr } = await supabase
      .from("students")
      .insert({
        org_id: app.org_id, // the application's org — never a column default
        first_name: app.first_name,
        last_name: app.last_name,
        email: app.email,
        phone: app.phone,
        location: app.location,
        stage: "learn",
        custom_fields: customFields,
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
