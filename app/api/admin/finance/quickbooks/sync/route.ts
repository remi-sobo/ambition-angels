import { NextResponse } from "next/server";
import { ctxHasPermission, getOrgContext } from "@/lib/admin/auth";
import { syncQuickBooks } from "@/lib/quickbooks/connection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/admin/finance/quickbooks/sync
// "Refresh now": re-pull the register and cash balance for the caller's org.
// The daily cron (/api/cron/quickbooks-sync) does the same for every org.
export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ctxHasPermission(ctx, "finance.write"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await syncQuickBooks(ctx.orgId);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
