import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/**
 * POST — backfill a past filing by hand (marking an item filed records the
 * current one automatically). Detail fields (confirmation, fee, notes) are
 * edited per-filing via PATCH /filings/[filingId].
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  if (!isISODate(body.filed_date)) {
    return NextResponse.json({ error: "filed_date must be YYYY-MM-DD" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // Org fence: service-role client bypasses RLS — the parent item must be
  // the caller's before any filing hangs off it.
  const { data: item } = await supabase
    .from("compliance_items")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("id", params.id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const insert: Record<string, unknown> = {
    org_id: ctx.orgId,
    item_id: params.id,
    filed_date: body.filed_date,
    filed_by: await getAdminUser(),
  };
  if (isISODate(body.period_due_date)) insert.period_due_date = body.period_due_date;
  if (typeof body.confirmation === "string" && body.confirmation.trim())
    insert.confirmation = body.confirmation.trim().slice(0, 120);
  if (typeof body.fee === "number" && Number.isFinite(body.fee) && body.fee >= 0)
    insert.fee = body.fee;
  if (typeof body.notes === "string" && body.notes.trim())
    insert.notes = body.notes.trim().slice(0, 2000);

  const { data, error } = await supabase
    .from("compliance_filings")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("Create compliance filing failed:", error?.message);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  await audit(req, {
    action: "compliance.filing.create",
    entityType: "compliance_filing",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id });
}
