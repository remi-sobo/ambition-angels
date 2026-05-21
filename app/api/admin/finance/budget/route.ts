import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";

// POST /api/admin/finance/budget
//
// Upsert a single (year, category_id) budget row. Body:
//   { year: number, category_id: string,
//     base_amount?: number, contingency_t1?: number,
//     contingency_t2?: number, activated_contingency?: number,
//     notes?: string | null }
//
// Missing amount fields default to 0 (on insert) or are left alone (on
// update). Idempotent for the same (year, category_id) — used by the
// inline editor on /admin/finance/budget.
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const year = typeof body.year === "number" && Number.isInteger(body.year) ? body.year : null;
  const category_id = typeof body.category_id === "string" ? body.category_id : "";
  if (!year || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "year is required" }, { status: 400 });
  }
  if (!category_id) {
    return NextResponse.json({ error: "category_id is required" }, { status: 400 });
  }

  function num(k: string): number | undefined {
    const v = body![k];
    if (v === undefined) return undefined;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return undefined;
    // Snap to two decimals to keep the DB tidy.
    return Math.round(v * 100) / 100;
  }

  const update: Record<string, unknown> = { year, category_id };
  const base = num("base_amount");
  const t1 = num("contingency_t1");
  const t2 = num("contingency_t2");
  const act = num("activated_contingency");
  if (base !== undefined) update.base_amount = base;
  if (t1 !== undefined) update.contingency_t1 = t1;
  if (t2 !== undefined) update.contingency_t2 = t2;
  if (act !== undefined) update.activated_contingency = act;
  if ("notes" in body) {
    const v = body.notes;
    if (v === null || v === "") update.notes = null;
    else if (typeof v === "string") update.notes = v.slice(0, 1000);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fin_budget")
    .upsert(update, { onConflict: "year,category_id" })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json({ error: "Unknown category" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, row: data });
}
