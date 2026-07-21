import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const ROLES = ["chair", "vice_chair", "secretary", "treasurer", "member"] as const;
const STATUSES = ["active", "emeritus", "past"] as const;
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Nullable free-text profile fields editable from /admin/board/[id].
const TEXT_FIELDS: Array<[key: string, max: number]> = [
  ["phone", 40],
  ["affiliation", 120],
  ["bio", 2000],
  ["notes", 2000],
];

// Onboarding checklist: same jsonb [{id, text, done}] shape (and limits) as
// compliance_items.checklist. The client always sends the full array.
function parseChecklist(v: unknown): Array<{ id: string; text: string; done: boolean }> | null {
  if (!Array.isArray(v) || v.length > 100) return null;
  const out: Array<{ id: string; text: string; done: boolean }> = [];
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null) return null;
    const { id, text, done } = raw as Record<string, unknown>;
    if (typeof id !== "string" || typeof text !== "string" || typeof done !== "boolean") return null;
    if (!text.trim()) continue;
    out.push({ id: id.slice(0, 40), text: text.trim().slice(0, 300), done });
  }
  return out;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
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
  if (typeof body.name === "string" && body.name.trim())
    update.name = body.name.trim().slice(0, 120);
  if ("email" in body) {
    if (body.email === null || body.email === "") update.email = null;
    else if (typeof body.email === "string" && body.email.includes("@"))
      update.email = body.email.trim().toLowerCase();
  }
  for (const [key, max] of TEXT_FIELDS) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null || v === "") update[key] = null;
    else if (typeof v === "string") update[key] = v.trim().slice(0, max);
  }
  if ("checklist" in body) {
    const checklist = parseChecklist(body.checklist);
    if (checklist === null) {
      return NextResponse.json({ error: "Invalid checklist" }, { status: 400 });
    }
    update.checklist = checklist;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: before } = await supabase
    .from("board_members")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A new email re-attempts the constituent link (same exact-match rule as
  // POST) so giving status follows the address. No match keeps the existing
  // link — an email typo shouldn't sever real giving history.
  if (typeof update.email === "string" && update.email !== before.email) {
    const { data: match } = await supabase
      .from("constituents")
      .select("id")
      .eq("org_id", ctx.orgId)
      .contains("emails", [update.email])
      .limit(1)
      .maybeSingle();
    if (match) update.constituent_id = match.id;
  }

  const { error } = await supabase.from("board_members").update(update).eq("org_id", ctx.orgId).eq("id", params.id);
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
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: before } = await supabase
    .from("board_members")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("id", params.id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("board_members").delete().eq("org_id", ctx.orgId).eq("id", params.id);
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
