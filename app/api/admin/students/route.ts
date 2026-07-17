import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getFieldDefs, validateAndMerge } from "@/lib/admin/customFields";
import { audit } from "@/lib/audit";

const STAGES = [
  "discover", "learn", "practice", "connect", "launch", "alumni", "withdrawn",
] as const;

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const firstName =
    body && typeof body.first_name === "string" ? body.first_name.trim().slice(0, 120) : "";
  if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 });

  // org from session, never a column default.
  const insert: Record<string, unknown> = { first_name: firstName, org_id: ctx.orgId };
  if (STAGES.includes(body?.stage as (typeof STAGES)[number])) insert.stage = body!.stage;
  if (typeof body?.email === "string" && body.email.includes("@"))
    insert.email = body.email.trim().toLowerCase();
  for (const f of ["last_name", "grade", "school", "guardian_name", "guardian_phone"] as const) {
    if (typeof body?.[f] === "string" && (body[f] as string).trim())
      insert[f] = (body[f] as string).trim().slice(0, 120);
  }
  if (typeof body?.guardian_email === "string" && body.guardian_email.includes("@"))
    insert.guardian_email = body.guardian_email.trim().toLowerCase();

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
