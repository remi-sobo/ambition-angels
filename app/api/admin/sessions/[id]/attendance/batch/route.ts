import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/admin/requirePermission";
import { isMarkStatus, resolveLastWrite, type MarkStatus } from "@/lib/admin/program/attendance";

/**
 * POST /api/admin/sessions/[id]/attendance/batch
 *   { marks: [{ student_id, status, at }] }
 *
 * The phone attendance screen's one write path (V4 Stage E). Taps queue on
 * the device (lib/admin/program/attendanceQueue.ts) and arrive here in one
 * request per session, now or when the phone is back online.
 *
 * Fences: program.write; the session must be in the ACTIVE org (else 404);
 * only enrolled members of that session's cohort in the same org are written
 * (anyone else is reported as rejected). Last write per participant wins by
 * the tap time `at` (resolveLastWrite): a queued mark older than the stored
 * one is skipped as stale, so a phone that was offline never overwrites a
 * newer mark. Re-sending the same batch writes the same values (idempotent).
 * Recording marks the session held and bumps last_activity_at for people who
 * came (present or late). One audit row per request.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const MAX_MARKS = 500;

type InMark = { participantId: string; status: MarkStatus; at: string };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requirePermission("program.write");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { marks?: unknown } | null;
  const raw = Array.isArray(body?.marks) ? (body!.marks as unknown[]) : null;
  if (!raw || raw.length === 0) return NextResponse.json({ error: "No marks to save." }, { status: 400 });
  if (raw.length > MAX_MARKS) return NextResponse.json({ error: `Send at most ${MAX_MARKS} marks at a time.` }, { status: 400 });
  const marks: InMark[] = [];
  for (const m of raw) {
    const r = (m ?? {}) as Record<string, unknown>;
    if (!isUuid(r.student_id) || !isMarkStatus(r.status)) {
      return NextResponse.json({ error: "Each mark needs a participant and a status." }, { status: 400 });
    }
    marks.push({ participantId: r.student_id.toLowerCase(), status: r.status, at: typeof r.at === "string" ? r.at : "" });
  }

  const db = getSupabaseAdmin();
  const { data: session } = await db
    .from("cohort_sessions")
    .select("id, cohort_id, status, org_id")
    .eq("org_id", ctx.orgId)
    .eq("id", params.id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const ids = Array.from(new Set(marks.map((m) => m.participantId)));
  const [{ data: members }, { data: stored }] = await Promise.all([
    db
      .from("cohort_members")
      .select("student_id")
      .eq("org_id", ctx.orgId)
      .eq("cohort_id", session.cohort_id)
      .eq("status", "enrolled")
      .in("student_id", ids),
    db
      .from("attendance")
      .select("student_id, recorded_at")
      .eq("org_id", ctx.orgId)
      .eq("session_id", session.id)
      .in("student_id", ids),
  ]);
  const enrolled = new Set(((members ?? []) as { student_id: string }[]).map((m) => m.student_id.toLowerCase()));
  const existing = new Map(
    ((stored ?? []) as { student_id: string; recorded_at: string }[]).map((m) => [m.student_id.toLowerCase(), m.recorded_at]),
  );
  const allowed = marks.filter((m) => enrolled.has(m.participantId));
  const rejected = ids.filter((id) => !enrolled.has(id)).length;
  if (allowed.length === 0) {
    return NextResponse.json({ error: "None of these people are enrolled in this session's cohort." }, { status: 409 });
  }
  const { apply, stale } = resolveLastWrite(allowed, existing, new Date().toISOString());

  const recordedBy = (await getAdminUser()) ?? "admin";
  if (apply.length > 0) {
    const { error } = await db.from("attendance").upsert(
      apply.map((m) => ({
        org_id: session.org_id, // the session's org (already pinned to ctx.orgId above)
        session_id: session.id,
        student_id: m.participantId,
        status: m.status,
        method: "roster",
        recorded_by: recordedBy,
        recorded_at: m.at,
      })),
      { onConflict: "session_id,student_id" },
    );
    if (error) {
      console.error("[attendance batch] save failed:", error.message);
      return NextResponse.json({ error: "Could not save attendance. Your marks are still on this device." }, { status: 500 });
    }
    const came = apply.filter((m) => m.status === "present" || m.status === "late").map((m) => m.participantId);
    if (came.length > 0) {
      await db
        .from("students")
        .update({ last_activity_at: new Date().toISOString().slice(0, 10) })
        .eq("org_id", ctx.orgId)
        .in("id", came);
    }
    if (session.status !== "held") {
      await db.from("cohort_sessions").update({ status: "held" }).eq("org_id", ctx.orgId).eq("id", session.id);
    }
    await audit(req, {
      action: "program.attendance.record",
      entityType: "cohort_session",
      entityId: session.id,
      after: { batch: true, applied: apply.length, stale: stale.length, rejected, method: "roster" },
    });
  }

  return NextResponse.json({ ok: true, applied: apply.length, stale: stale.length, rejected });
}
