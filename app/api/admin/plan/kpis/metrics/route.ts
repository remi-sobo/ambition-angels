import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPlanMetricOptions } from "@/lib/admin/plan/metrics";
import { requirePermission } from "@/lib/admin/requirePermission";

// The Metrics Library picker (Phase C): the bindable auto-metrics with live
// values + whether each is already attached. Powers "Track automatically" in the
// KPI editor. Org-scoped on the service-role client, like the rest of the plan.
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("metrics.read");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const ctx = guard.ctx;
  const metrics = await getPlanMetricOptions(getSupabaseAdmin(), ctx.orgId);
  return NextResponse.json({ metrics });
}
