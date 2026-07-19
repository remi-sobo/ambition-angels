import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const STATUSES = ["present", "late", "excused", "absent"] as const;
const METHODS = ["roster", "qr", "kiosk", "admin"] as const;
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// Roster-tap recorder: one call per tap. { student_id, status } upserts the
// mark; { student_id, status: null } clears it; { all: "present" } fills
// every still-unmarked enrolled member. Recording marks the session held
// and bumps last_activity_at for students who showed up.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: session } = await supabase
    .from("cohort_sessions")
    .select("id, cohort_id, status, org_id")
    .eq("org_id", ctx.orgId)
    .eq("id", params.id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const recordedBy = (await getAdminUser()) ?? "admin";
  const method = METHODS.includes(body.method as (typeof METHODS)[number])
    ? (body.method as string)
    : "roster";

  const markHeld = async () => {
    if (session.status !== "held") {
      await supabase.from("cohort_sessions").update({ status: "held" }).eq("org_id", ctx.orgId).eq("id", session.id);
    }
  };
  const touch = async (studentIds: string[]) => {
    if (studentIds.length === 0) return;
    await supabase
      .from("students")
      .update({ last_activity_at: new Date().toISOString().slice(0, 10) })
      .eq("org_id", ctx.orgId)
      .in("id", studentIds);
  };

  if (body.all === "present") {
    const { data: members } = await supabase
      .from("cohort_members")
      .select("student_id")
      .eq("org_id", ctx.orgId)
      .eq("cohort_id", session.cohort_id)
      .eq("status", "enrolled");
    const { data: marked } = await supabase
      .from("attendance")
      .select("student_id")
      .eq("org_id", ctx.orgId)
      .eq("session_id", session.id);
    const done = new Set((marked ?? []).map((m) => m.student_id));
    const todo = (members ?? []).map((m) => m.student_id).filter((id) => !done.has(id));
    if (todo.length > 0) {
      const { error } = await supabase.from("attendance").insert(
        todo.map((student_id) => ({
          org_id: session.org_id, // the session's org — never a column default
          session_id: session.id,
          student_id,
          status: "present",
          method,
          recorded_by: recordedBy,
        }))
      );
      if (error) {
        console.error("Mark all present failed:", error.message);
        return NextResponse.json({ error: "Record failed" }, { status: 500 });
      }
      await touch(todo);
    }
    await markHeld();
    await audit(req, {
      action: "program.attendance.record",
      entityType: "cohort_session",
      entityId: session.id,
      after: { all: "present", count: todo.length, method },
    });
    return NextResponse.json({ ok: true, marked: todo.length });
  }

  if (!isUuid(body.student_id)) {
    return NextResponse.json({ error: "student_id is required" }, { status: 400 });
  }
  const studentId = body.student_id as string;

  if (body.status === null) {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("org_id", ctx.orgId)
      .eq("session_id", session.id)
      .eq("student_id", studentId);
    if (error) {
      console.error("Clear attendance failed:", error.message);
      return NextResponse.json({ error: "Record failed" }, { status: 500 });
    }
    await audit(req, {
      action: "program.attendance.clear",
      entityType: "cohort_session",
      entityId: session.id,
      after: { student_id: studentId },
    });
    return NextResponse.json({ ok: true });
  }

  if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const status = body.status as string;

  const { error } = await supabase.from("attendance").upsert(
    {
      org_id: session.org_id, // the session's org — never a column default
      session_id: session.id,
      student_id: studentId,
      status,
      method,
      recorded_by: recordedBy,
      recorded_at: new Date().toISOString(),
    },
    { onConflict: "session_id,student_id" }
  );
  if (error) {
    console.error("Record attendance failed:", error.message);
    return NextResponse.json({ error: "Record failed" }, { status: 500 });
  }
  if (status === "present" || status === "late") await touch([studentId]);
  await markHeld();
  await audit(req, {
    action: "program.attendance.record",
    entityType: "cohort_session",
    entityId: session.id,
    after: { student_id: studentId, status, method },
  });
  return NextResponse.json({ ok: true });
}
