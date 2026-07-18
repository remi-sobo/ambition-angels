import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getFieldDefs, validateAndMerge } from "@/lib/admin/customFields";
import { getParticipantStages } from "@/lib/admin/program/stages";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const firstName =
    body && typeof body.first_name === "string" ? body.first_name.trim().slice(0, 120) : "";
  if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 });

  // org from session, never a column default. Universal identity is columns;
  // grade / school / guardian_* / dob are registry fields (custom_fields) now.
  const insert: Record<string, unknown> = { first_name: firstName, org_id: ctx.orgId };
  // Stage must be one of THIS org's participant_stages (per-org, not a hardcoded
  // list) — else omit and let the column default apply.
  const stageKeys = new Set((await getParticipantStages()).map((s) => s.stage_key));
  if (typeof body?.stage === "string" && stageKeys.has(body.stage)) insert.stage = body.stage;
  if (typeof body?.email === "string" && body.email.includes("@"))
    insert.email = body.email.trim().toLowerCase();
  if (typeof body?.last_name === "string" && body.last_name.trim())
    insert.last_name = body.last_name.trim().slice(0, 120);
  // Leader link: must be one of THIS org's volunteer-flagged constituents —
  // the service client bypasses RLS, so the org fence is re-asserted here.
  if (typeof body?.leader_id === "string" && /^[0-9a-f-]{36}$/i.test(body.leader_id)) {
    const { data: leader } = await getSupabaseAdmin()
      .from("constituents")
      .select("id")
      .eq("id", body.leader_id)
      .eq("org_id", ctx.orgId)
      .eq("is_volunteer", true)
      .maybeSingle();
    if (!leader) return NextResponse.json({ error: "Unknown leader" }, { status: 400 });
    insert.leader_id = body.leader_id;
  }

  // Per-org custom fields (spec #4 D1): validated against this org's registry.
  // requireAll on create so a required field can't be skipped. Empty registry
  // (AA today) + no incoming = no-op.
  if ("custom_fields" in (body ?? {})) {
    const defs = await getFieldDefs(ctx.orgId, "student");
    const merged = validateAndMerge(defs, {}, body!.custom_fields as Record<string, unknown>, { requireAll: true });
    if (!merged.ok) return NextResponse.json({ error: merged.error }, { status: 400 });
    insert.custom_fields = merged.value;
  }

  const { data, error } = await getSupabaseAdmin()
    .from("students")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create student failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "program.student.create",
    entityType: "student",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
