import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const STATUSES = ["upcoming", "in_progress", "submitted", "waived"] as const;

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// PATCH /api/admin/grants/requirements/:id — status flips ("mark
// submitted") and due-date corrections.
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
  if ("status" in body && STATUSES.includes(body.status as (typeof STATUSES)[number])) {
    update.status = body.status;
    // Stamp/clear submitted_at with the status flip unless caller overrides.
    update.submitted_at = body.status === "submitted" ? new Date().toISOString() : null;
  }
  if ("due_date" in body && isISODate(body.due_date)) update.due_date = body.due_date;
  if ("label" in body) {
    const v = body.label;
    if (v === null || v === "") update.label = null;
    else if (typeof v === "string") update.label = v.slice(0, 200);
  }
  if ("notes" in body) {
    const v = body.notes;
    if (v === null || v === "") update.notes = null;
    else if (typeof v === "string") update.notes = v.slice(0, 1000);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("grant_requirements")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.grant_requirement.update",
    entityType: "grant_requirements",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true, requirement: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createServerSupabase();
  const { data: deleted, error } = await supabase
    .from("grant_requirements")
    .delete()
    .eq("id", params.id)
    .select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (deleted && deleted.length > 0) {
    await audit(req, {
      action: "fundraising.grant_requirement.delete",
      entityType: "grant_requirements",
      entityId: params.id,
      before: deleted[0],
    });
  }
  return NextResponse.json({ ok: true });
}
