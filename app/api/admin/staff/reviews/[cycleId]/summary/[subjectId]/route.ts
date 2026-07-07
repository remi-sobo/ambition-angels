import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { resolveStaffAccess, isUuid, str } from "@/app/admin/staff/_lib/guard";

// PUT /api/admin/staff/reviews/:cycleId/summary/:subjectId — a manager writes the
// synthesis. The shared summary and the PRIVATE notes go to two different tables,
// so RLS keeps the subject out of the notes entirely (hard guarantee, not a
// masked column). Only a manager-above / staff.manage — never the subject.
// Body: { summary, notes, share }.
export async function PUT(
  req: NextRequest,
  { params }: { params: { cycleId: string; subjectId: string } }
) {
  if (!isUuid(params.cycleId) || !isUuid(params.subjectId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const access = await resolveStaffAccess(params.subjectId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Managers/manage synthesize; the subject may not write their own review.
  if (!access.canView || access.isSelf) {
    return NextResponse.json({ error: "Only a manager can write the synthesis." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected JSON" }, { status: 400 });

  // Author = the manager's own staff row.
  const { data: me } = await access.supabase
    .from("staff")
    .select("id")
    .eq("user_id", access.ctx.userId)
    .eq("org_id", access.staff.org_id)
    .maybeSingle();
  const authorId = (me as { id: string } | null)?.id ?? null;
  const share = body.share === true;

  const summaryRow = {
    org_id: access.staff.org_id,
    cycle_id: params.cycleId,
    subject_staff_id: params.subjectId,
    summary: str(body.summary, 8000),
    author_staff_id: authorId,
    ...(share ? { shared_at: new Date().toISOString() } : {}),
  };
  const { error: sErr } = await access.supabase
    .from("review_summaries")
    .upsert(summaryRow, { onConflict: "cycle_id,subject_staff_id" });
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });

  // Private notes only when provided (keeps the row absent otherwise).
  if ("notes" in body) {
    const { error: nErr } = await access.supabase.from("review_manager_notes").upsert(
      {
        org_id: access.staff.org_id,
        cycle_id: params.cycleId,
        subject_staff_id: params.subjectId,
        notes: str(body.notes, 8000),
        author_staff_id: authorId,
      },
      { onConflict: "cycle_id,subject_staff_id" }
    );
    if (nErr) return NextResponse.json({ error: nErr.message }, { status: 400 });
  }

  await audit(req, {
    action: share ? "staff.review_summary.share" : "staff.review_summary.save",
    entityType: "review_summaries",
    entityId: params.subjectId,
    after: { cycle_id: params.cycleId, shared: share },
  });
  return NextResponse.json({ ok: true });
}
