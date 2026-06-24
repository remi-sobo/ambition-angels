import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPlanMetricOptions } from "@/lib/admin/plan/metrics";

// The Metrics Library picker (Phase C): the bindable auto-metrics with live
// values + whether each is already attached. Powers "Track automatically" in the
// KPI editor. Org-scoped on the service-role client, like the rest of the plan.
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const metrics = await getPlanMetricOptions(getSupabaseAdmin(), ctx.orgId);
  return NextResponse.json({ metrics });
}
