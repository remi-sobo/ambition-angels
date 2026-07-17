import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { getFieldDefs, validateAndMerge } from "@/lib/admin/customFields";
import { LEGACY_STUDENT_FIELD_KEYS } from "@/lib/admin/program/legacyFields";
import { audit } from "@/lib/audit";

const STAGES = [
  "discover", "learn", "practice", "connect", "launch", "alumni", "withdrawn",
] as const;
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
  if (STAGES.includes(body.stage as (typeof STAGES)[number])) update.stage = body.stage;
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
  if (Object.keys(update).length === 0 && !hasCustom) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("students").select("*").eq("id", params.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    // Dual-write shim (D2→D5): keep the legacy columns in lockstep with the
    // registry so unmigrated readers stay current; a cleared key nulls its
    // column too. Dropped in D5.
    for (const k of LEGACY_STUDENT_FIELD_KEYS) {
      update[k] = k in merged.value ? merged.value[k] : null;
    }
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
