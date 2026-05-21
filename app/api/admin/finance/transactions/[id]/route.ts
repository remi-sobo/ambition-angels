import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

// PATCH /api/admin/finance/transactions/:id
//
// Partial update for a single transaction. Used by the inline category
// picker and restricted toggle on /admin/finance/transactions. Any subset of
// (category_id, restricted, restricted_to, notes) may be supplied; missing
// fields are left alone. category_id = "" clears the category back to null
// (un-categorize).
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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if ("category_id" in body) {
    const v = body.category_id;
    if (v === null || v === "") {
      update.category_id = null;
    } else if (typeof v === "string" && v.length <= 100) {
      update.category_id = v;
    } else {
      return NextResponse.json({ error: "Invalid category_id" }, { status: 400 });
    }
  }
  if ("restricted" in body) {
    if (typeof body.restricted !== "boolean") {
      return NextResponse.json({ error: "restricted must be boolean" }, { status: 400 });
    }
    update.restricted = body.restricted;
  }
  if ("restricted_to" in body) {
    const v = body.restricted_to;
    if (v === null || v === "") update.restricted_to = null;
    else if (typeof v === "string") update.restricted_to = v.slice(0, 200);
    else return NextResponse.json({ error: "Invalid restricted_to" }, { status: 400 });
  }
  if ("notes" in body) {
    const v = body.notes;
    if (v === null || v === "") update.notes = null;
    else if (typeof v === "string") update.notes = v.slice(0, 1000);
    else return NextResponse.json({ error: "Invalid notes" }, { status: 400 });
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fin_transactions")
    .update(update)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    if (error.code === "23503") {
      // FK violation — category_id doesn't exist.
      return NextResponse.json({ error: "Unknown category" }, { status: 400 });
    }
    console.error("[finance] PATCH transaction failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, transaction: data });
}
