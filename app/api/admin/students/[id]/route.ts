import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { getFieldDefs, validateAndMerge } from "@/lib/admin/customFields";
import { getParticipantStages } from "@/lib/admin/program/stages";
import { audit } from "@/lib/audit";

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

  // Universal identity columns only; grade / school / guardian_* / dob are
  // registry fields (custom_fields), handled below.
  const update: Record<string, unknown> = {};
  if (typeof body.stage === "string") {
    const stageKeys = new Set((await getParticipantStages()).map((s) => s.stage_key));
    if (stageKeys.has(body.stage)) update.stage = body.stage;
  }
  if ("last_activity_at" in body) {
    if (body.last_activity_at === null || body.last_activity_at === "") update.last_activity_at = null;
    else if (isISODate(body.last_activity_at)) update.last_activity_at = body.last_activity_at;
  }
  if (body.touch === true) update.last_activity_at = new Date().toISOString().slice(0, 10);
  for (const f of ["first_name", "last_name", "email", "phone", "location", "notes"] as const) {
    if (f in body) {
      if (body[f] === null || body[f] === "") {
        if (f !== "first_name") update[f] = null;
      } else if (typeof body[f] === "string") {
        update[f] = (body[f] as string).trim().slice(0, f === "notes" ? 2000 : 120);
      }
    }
  }
  if (typeof update.email === "string") update.email = update.email.toLowerCase();

  const hasCustom = "custom_fields" in body;
  const hasLeader = "leader_id" in body;
  if (Object.keys(update).length === 0 && !hasCustom && !hasLeader) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("students").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Leader link: null clears; a uuid must be one of the row's org's
  // volunteer-flagged constituents (service client bypasses RLS — the org
  // fence is re-asserted here, org from the row like custom fields below).
  if (hasLeader) {
    if (body.leader_id === null || body.leader_id === "") {
      update.leader_id = null;
    } else if (typeof body.leader_id === "string" && /^[0-9a-f-]{36}$/i.test(body.leader_id)) {
      const { data: leader } = await supabase
        .from("constituents")
        .select("id")
        .eq("id", body.leader_id)
        .eq("org_id", (before as { org_id: string }).org_id)
        .eq("is_volunteer", true)
        .maybeSingle();
      if (!leader) return NextResponse.json({ error: "Unknown leader" }, { status: 400 });
      update.leader_id = body.leader_id;
    }
  }

  // Per-org custom fields (spec #4 D1): merge incoming onto the row's current
  // values, validated against this org's registry (org from the row, not the
  // request). No requireAll on edit — a newly-required field isn't forced onto
  // an old record (spec §10 #4).
  if (hasCustom) {
    const defs = await getFieldDefs((before as { org_id: string }).org_id, "student");
    const merged = validateAndMerge(
      defs,
      ((before as { custom_fields?: Record<string, unknown> }).custom_fields) ?? {},
      body.custom_fields as Record<string, unknown>,
    );
    if (!merged.ok) return NextResponse.json({ error: merged.error }, { status: 400 });
    update.custom_fields = merged.value;
  }

  const { error } = await supabase.from("students").update(update).eq("id", params.id);
  if (error) {
    console.error("Update student failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "stage" in update ? "program.student.stage" : "program.student.update",
    entityType: "student",
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
    .from("students").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("students").delete().eq("id", params.id);
  if (error) {
    console.error("Delete student failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.student.delete",
    entityType: "student",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
