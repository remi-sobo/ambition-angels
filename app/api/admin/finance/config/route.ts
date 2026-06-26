import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

function isISODate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// POST /api/admin/finance/config
//
// Updates the singleton row (id=1). All fields optional — sending one
// updates that one. Server validates ranges (year in [2000..2100], month
// 1..12, threshold > 0, amounts non-negative). The row is guaranteed to
// exist (seeded in the migration); if for some reason it doesn't, we
// upsert.
export async function POST(req: NextRequest) {
  if (!await isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = { id: 1 };

  if ("current_year" in body) {
    const v = body.current_year;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 2000 || v > 2100) {
      return NextResponse.json({ error: "current_year out of range" }, { status: 400 });
    }
    update.current_year = v;
  }
  if ("fiscal_year_start_month" in body) {
    const v = body.fiscal_year_start_month;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 12) {
      return NextResponse.json({ error: "fiscal_year_start_month must be 1..12" }, { status: 400 });
    }
    update.fiscal_year_start_month = v;
  }
  if ("fundraising_goal" in body) {
    const v = body.fundraising_goal;
    if (v === null) update.fundraising_goal = null;
    else if (typeof v !== "number" || v < 0)
      return NextResponse.json({ error: "fundraising_goal must be a non-negative number" }, { status: 400 });
    else update.fundraising_goal = Math.round(v * 100) / 100;
  }
  if ("contingency_unlock_threshold" in body) {
    const v = body.contingency_unlock_threshold;
    if (v === null) update.contingency_unlock_threshold = null;
    else if (typeof v !== "number" || v <= 0 || v > 10)
      return NextResponse.json(
        { error: "contingency_unlock_threshold must be a positive number (typically 1.0..2.0)" },
        { status: 400 }
      );
    else update.contingency_unlock_threshold = v;
  }
  if ("cash_starting_balance" in body) {
    const v = body.cash_starting_balance;
    if (v === null) update.cash_starting_balance = null;
    else if (typeof v !== "number")
      return NextResponse.json({ error: "cash_starting_balance must be a number" }, { status: 400 });
    else update.cash_starting_balance = Math.round(v * 100) / 100;
  }
  if ("cash_starting_date" in body) {
    const v = body.cash_starting_date;
    if (v === null || v === "") update.cash_starting_date = null;
    else if (!isISODate(v))
      return NextResponse.json({ error: "cash_starting_date must be YYYY-MM-DD" }, { status: 400 });
    else update.cash_starting_date = v;
  }
  if ("monthly_burn_baseline" in body) {
    const v = body.monthly_burn_baseline;
    if (v === null) update.monthly_burn_baseline = null;
    else if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
      return NextResponse.json({ error: "monthly_burn_baseline must be a non-negative number" }, { status: 400 });
    else update.monthly_burn_baseline = Math.round(v * 100) / 100;
  }
  if ("forward_horizon_months" in body) {
    const v = body.forward_horizon_months;
    if (v === null) update.forward_horizon_months = null;
    else if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 60)
      return NextResponse.json({ error: "forward_horizon_months must be an integer 1..60" }, { status: 400 });
    else update.forward_horizon_months = v;
  }

  if (Object.keys(update).length <= 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fin_config")
    .upsert(update, { onConflict: "id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(req, {
    action: "finance.config.update",
    entityType: "fin_config",
    after: update,
  });
  return NextResponse.json({ ok: true, config: data });
}
