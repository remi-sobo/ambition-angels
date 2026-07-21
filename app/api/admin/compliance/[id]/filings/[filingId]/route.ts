import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

type Params = { params: { id: string; filingId: string } };

/** PATCH — filing detail fields: filed_date, period_due_date, confirmation, fee, notes. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id) || !isUuid(params.filingId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (isISODate(body.filed_date)) update.filed_date = body.filed_date;
  if ("period_due_date" in body) {
    if (body.period_due_date === null || body.period_due_date === "") update.period_due_date = null;
    else if (isISODate(body.period_due_date)) update.period_due_date = body.period_due_date;
  }
  if ("confirmation" in body) {
    if (body.confirmation === null || body.confirmation === "") update.confirmation = null;
    else if (typeof body.confirmation === "string")
      update.confirmation = body.confirmation.trim().slice(0, 120);
  }
  if ("fee" in body) {
    if (body.fee === null || body.fee === "") update.fee = null;
    else if (typeof body.fee === "number" && Number.isFinite(body.fee) && body.fee >= 0)
      update.fee = body.fee;
  }
  if ("notes" in body) {
    if (body.notes === null || body.notes === "") update.notes = null;
    else if (typeof body.notes === "string") update.notes = body.notes.trim().slice(0, 2000);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org
  // and the parent item from the URL.
  const { data: before } = await supabase
    .from("compliance_filings")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("item_id", params.id)
    .eq("id", params.filingId)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("compliance_filings")
    .update(update)
    .eq("org_id", ctx.orgId)
    .eq("id", params.filingId);
  if (error) {
    console.error("Update compliance filing failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  await audit(req, {
    action: "compliance.filing.update",
    entityType: "compliance_filing",
    entityId: params.filingId,
    before,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id) || !isUuid(params.filingId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — scope to the caller's org.
  const { data: before } = await supabase
    .from("compliance_filings")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("item_id", params.id)
    .eq("id", params.filingId)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("compliance_filings")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("id", params.filingId);
  if (error) {
    console.error("Delete compliance filing failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "compliance.filing.delete",
    entityType: "compliance_filing",
    entityId: params.filingId,
    before,
  });
  return NextResponse.json({ ok: true });
}
