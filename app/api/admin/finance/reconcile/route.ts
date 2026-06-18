import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

function isISODate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// POST /api/admin/finance/reconcile
//
// "Set current balance" — re-anchors the cash position to a real, bank-verified
// number. Sets cash_starting_balance + cash_starting_date and stamps
// cash_reconciled_at so every finance surface can show how fresh the figure is.
//
// Cash on hand is then (this balance) + (transactions dated after `as_of`), so
// the displayed number is always anchored to a number the user confirmed.
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const balance = body.balance;
  if (typeof balance !== "number" || !Number.isFinite(balance)) {
    return NextResponse.json({ error: "balance must be a number" }, { status: 400 });
  }

  const asOf = body.as_of;
  let asOfDate: string;
  if (asOf === undefined || asOf === null || asOf === "") {
    asOfDate = new Date().toISOString().slice(0, 10);
  } else if (isISODate(asOf)) {
    asOfDate = asOf;
  } else {
    return NextResponse.json({ error: "as_of must be YYYY-MM-DD" }, { status: 400 });
  }

  const update = {
    id: 1,
    cash_starting_balance: Math.round(balance * 100) / 100,
    cash_starting_date: asOfDate,
    cash_reconciled_at: new Date().toISOString(),
  };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fin_config")
    .upsert(update, { onConflict: "id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "finance.reconcile",
    entityType: "fin_config",
    after: update,
  });
  return NextResponse.json({ ok: true, config: data });
}
