import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { refreshAllPlanMetrics } from "@/lib/admin/plan/metrics";
import { captureUnlinkedComputedMetrics } from "@/lib/admin/metrics/catalog";

/**
 * Daily metric capture (Metric Catalog spec #3, Phase 3).
 *
 * Two writers, each canonical for its slice:
 *  - refreshAllPlanMetrics: plan-linked computed metrics. Writes
 *    plan_kpis.current/status + plan_kpi_snapshots + metric_snapshots in one
 *    pass, so the scorecard and the catalog cannot diverge.
 *  - captureUnlinkedComputedMetrics: catalog-only computed metrics
 *    (monthly_burn, gifts_this_month, …) → metric_snapshots.
 *
 * Both upsert on their day-unique constraints, so a Vercel retry cannot
 * double-write (spec failure mode: cron double-writes).
 *
 * Auth via Bearer CRON_SECRET, the house cron convention.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  const [planUpdated, unlinkedWritten] = await Promise.all([
    refreshAllPlanMetrics(admin),
    captureUnlinkedComputedMetrics(admin),
  ]);
  return NextResponse.json({ ok: true, planUpdated, unlinkedWritten });
}
