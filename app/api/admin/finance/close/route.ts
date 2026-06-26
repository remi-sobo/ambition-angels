import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// POST /api/admin/finance/close
//
// Stamps the end of the Friday reconciliation ritual. Sets
// fin_config.last_reconciled_at = now() so every finance surface can show
// "reconciled as of <date>". It does NOT touch the balance, baseline, or any
// transaction — those are set in their own steps; this just records that the
// close was run to completion.
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = { id: 1, last_reconciled_at: new Date().toISOString() };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fin_config")
    .upsert(update, { onConflict: "id" })
    .select("last_reconciled_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "finance.close",
    entityType: "fin_config",
    after: update,
  });
  return NextResponse.json({ ok: true, last_reconciled_at: data.last_reconciled_at });
}
