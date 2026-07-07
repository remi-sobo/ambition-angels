import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { resolveStaffAccess, isUuid, num, str } from "@/app/admin/staff/_lib/guard";
import { isAutoMetricKey, STAFF_METRIC_META } from "@/lib/admin/staff/metrics";

// POST /api/admin/staff/:id/kpis — create a personal KPI. An 'auto' KPI must name
// a metric_key the registry knows (lib/admin/staff/metrics.ts); a 'manual' KPI is
// hand-entered via snapshots. Session client only; RLS is the boundary.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const access = await resolveStaffAccess(params.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canView) return NextResponse.json({ error: "No access" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected JSON" }, { status: 400 });

  const source = body.source === "auto" ? "auto" : "manual";
  let linked_metric_key: string | null = null;
  if (source === "auto") {
    const key = str(body.linked_metric_key, 80);
    if (!isAutoMetricKey(key)) {
      return NextResponse.json({ error: "Unknown auto-metric key." }, { status: 400 });
    }
    linked_metric_key = key;
  }
  // A title is required for manual; auto KPIs may borrow the registry label.
  const title = str(body.title, 200) ?? (linked_metric_key ? STAFF_METRIC_META[linked_metric_key].label : null);
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  const insert = {
    org_id: access.staff.org_id,
    staff_id: access.staff.id,
    title,
    unit: str(body.unit, 40) ?? (linked_metric_key ? STAFF_METRIC_META[linked_metric_key].unit : null),
    target: num(body.target),
    cadence: str(body.cadence, 40),
    source,
    linked_metric_key,
  };

  const { data, error } = await access.supabase.from("staff_kpis").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await audit(req, {
    action: "staff.kpi.create",
    entityType: "staff_kpis",
    entityId: data.id,
    after: { staff_id: access.staff.id, title, source },
  });
  return NextResponse.json({ ok: true, kpi: data });
}
