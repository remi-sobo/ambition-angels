import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { sanitizeFactors, scoreFromFactors } from "@/app/admin/partners/_lib/rubric";

const KINDS = ["school", "district", "nonprofit", "company", "other"] as const;
const STATUSES = ["prospect", "outreach", "pilot", "active", "anchor", "lapsed"] as const;
const MOU = ["none", "drafting", "sent", "signed"] as const;
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
  if (KINDS.includes(body.kind as (typeof KINDS)[number])) update.kind = body.kind;
  if (STATUSES.includes(body.status as (typeof STATUSES)[number])) update.status = body.status;
  if (MOU.includes(body.mou_status as (typeof MOU)[number])) update.mou_status = body.mou_status;
  for (const f of ["mou_start", "mou_end", "data_agreement_signed", "last_touch_at"] as const) {
    if (f in body) {
      if (body[f] === null || body[f] === "") update[f] = null;
      else if (isISODate(body[f])) update[f] = body[f];
    }
  }
  if (body.touch === true) update.last_touch_at = new Date().toISOString().slice(0, 10);
  for (const f of [
    "champion_name", "champion_email", "champion_role", "city", "region", "domain", "teen_count", "program_type", "notes",
  ] as const) {
    if (f in body) {
      if (body[f] === null || body[f] === "") update[f] = null;
      else if (typeof body[f] === "string")
        update[f] = (body[f] as string).trim().slice(0, f === "notes" ? 2000 : 120);
    }
  }
  // Rubric: store the per-dimension scores and derive the 0–100 priority
  // from them (an explicit priority_score below can still override).
  if ("score_factors" in body) {
    if (body.score_factors === null) {
      update.score_factors = null;
      update.priority_score = null;
    } else {
      const factors = sanitizeFactors(body.score_factors);
      update.score_factors = factors;
      update.priority_score = scoreFromFactors(factors);
    }
  }
  if ("priority_score" in body) {
    const n = Number(body.priority_score);
    if (body.priority_score === null || body.priority_score === "") update.priority_score = null;
    else if (Number.isFinite(n)) update.priority_score = Math.max(0, Math.min(100, Math.round(n)));
  }
  if (typeof body.name === "string" && body.name.trim())
    update.name = body.name.trim().slice(0, 200);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("partners").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("partners").update(update).eq("id", params.id);
  if (error) {
    console.error("Update partner failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "status" in update ? "program.partner.status" : "program.partner.update",
    entityType: "partner",
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
    .from("partners").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("partners").delete().eq("id", params.id);
  if (error) {
    console.error("Delete partner failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.partner.delete",
    entityType: "partner",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
