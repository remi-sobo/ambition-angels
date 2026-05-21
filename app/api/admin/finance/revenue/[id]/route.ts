import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

const STATUSES = ["secured", "projected", "received"] as const;

function isISODate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// PATCH /api/admin/finance/revenue/:id — partial update.
//
// Most-used field is `status` — the "mark received" button flips a pledge
// from secured/projected to received when money hits the account. Everything
// else (amount, probability, expected_date) is editable too for typo
// corrections.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthed(req)) {
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
  }
  if ("source_name" in body && typeof body.source_name === "string") {
    update.source_name = body.source_name.trim();
  }
  if ("amount" in body && typeof body.amount === "number" && body.amount >= 0) {
    update.amount = Math.round(body.amount * 100) / 100;
  }
  if ("probability" in body) {
    if (body.probability === null) update.probability = null;
    else if (typeof body.probability === "number" && body.probability >= 0 && body.probability <= 1)
      update.probability = body.probability;
  }
  if ("expected_date" in body) {
    if (body.expected_date === null || body.expected_date === "") update.expected_date = null;
    else if (isISODate(body.expected_date)) update.expected_date = body.expected_date;
  }
  if ("restricted" in body && typeof body.restricted === "boolean") {
    update.restricted = body.restricted;
  }
  if ("restricted_to" in body) {
    const v = body.restricted_to;
    if (v === null || v === "") update.restricted_to = null;
    else if (typeof v === "string") update.restricted_to = v.slice(0, 200);
  }
  if ("notes" in body) {
    const v = body.notes;
    if (v === null) update.notes = null;
    else if (typeof v === "string") update.notes = v.slice(0, 1000);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fin_revenue_commitments")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, pledge: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("fin_revenue_commitments").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
