import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { refreshOrgPlanMetrics } from "@/lib/admin/plan/metrics";

// Recompute the org's auto KPIs from live BloomOS data (Phase 3). Manual KPIs
// are untouched. Service-role reads are fine — getOrgContext authorizes and
// every write is scoped to the caller's org.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await ctxHasPermission(ctx, "org.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { updated, results } = await refreshOrgPlanMetrics(getSupabaseAdmin(), ctx.orgId);
  await audit(req, {
    action: "governance.kpi.refresh",
    entityType: "plan_kpi",
    entityId: null,
    after: { updated, results },
  });
  return NextResponse.json({ ok: true, updated, results });
}
