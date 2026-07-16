import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { upsertFinConfig } from "@/lib/admin/finance";
import { audit } from "@/lib/audit";

// POST /api/admin/finance/close
//
// Stamps the end of the Friday reconciliation ritual. Sets
// fin_config.last_reconciled_at = now() so every finance surface can show
// "reconciled as of <date>". It does NOT touch the balance, baseline, or any
// transaction — those are set in their own steps; this just records that the
// close was run to completion.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = { last_reconciled_at: new Date().toISOString() };

  const { data, error } = await upsertFinConfig(ctx.orgId, update);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  await audit(req, {
    action: "finance.close",
    entityType: "fin_config",
    after: update,
  });
  return NextResponse.json({ ok: true, last_reconciled_at: data.last_reconciled_at });
}
