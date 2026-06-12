import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const ROLES = ["chair", "vice_chair", "secretary", "treasurer", "member"] as const;
const STATUSES = ["active", "emeritus", "past"] as const;
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
  if (ROLES.includes(body.officer_role as (typeof ROLES)[number]))
    update.officer_role = body.officer_role;
  if (STATUSES.includes(body.status as (typeof STATUSES)[number])) update.status = body.status;
  if ("term_start" in body) {
    if (body.term_start === null || body.term_start === "") update.term_start = null;
    else if (isISODate(body.term_start)) update.term_start = body.term_start;
  }
  if ("term_end" in body) {
    if (body.term_end === null || body.term_end === "") update.term_end = null;
    else if (isISODate(body.term_end)) update.term_end = body.term_end;
  }
  if (typeof body.term_number === "number" && body.term_number >= 1)
    update.term_number = Math.round(body.term_number);
  // "Record COI" — today by default, or an explicit date.
  if (body.coi_signed_at === true) update.coi_signed_at = new Date().toISOString().slice(0, 10);
  else if (isISODate(body.coi_signed_at)) update.coi_signed_at = body.coi_signed_at;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("board_members")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("board_members").update(update).eq("id", params.id);
  if (error) {
    console.error("Update board member failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "coi_signed_at" in update ? "board.member.coi_recorded" : "board.member.update",
    entityType: "board_member",
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
    .from("board_members")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("board_members").delete().eq("id", params.id);
  if (error) {
    console.error("Delete board member failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "board.member.delete",
    entityType: "board_member",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
