import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Screening transitions. 'accepted' is excluded — accepting goes through
// /accept so the student + enrollment are created in the same step.
const STATUSES = [
  "new", "eligible", "ineligible", "waitlisted", "offered", "declined", "expired",
] as const;
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (STATUSES.includes(body.status as (typeof STATUSES)[number])) {
    update.status = body.status;
    if (body.status === "offered") update.offered_at = new Date().toISOString();
    if (body.status === "declined" || body.status === "ineligible" || body.status === "expired")
      update.decided_at = new Date().toISOString();
  }
  if ("priority" in body) {
    const n = Number(body.priority);
    if (Number.isInteger(n) && n >= 1 && n <= 3) update.priority = n;
  }
  if ("cohort_id" in body) {
    if (body.cohort_id === null || body.cohort_id === "") update.cohort_id = null;
    else if (isUuid(body.cohort_id)) update.cohort_id = body.cohort_id;
  }
  if ("screening_notes" in body) {
    update.screening_notes =
      typeof body.screening_notes === "string" && body.screening_notes.trim()
        ? body.screening_notes.trim().slice(0, 2000)
        : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("applications").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (before.status === "accepted" && "status" in update) {
    return NextResponse.json(
      { error: "Already accepted — manage the student on the roster instead" },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("applications").update(update).eq("id", params.id);
  if (error) {
    console.error("Update application failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "status" in update ? "program.application.screen" : "program.application.update",
    entityType: "application",
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
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("applications").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("applications").delete().eq("id", params.id);
  if (error) {
    console.error("Delete application failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.application.delete",
    entityType: "application",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
