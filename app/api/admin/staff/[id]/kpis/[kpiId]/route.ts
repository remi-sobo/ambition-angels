import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { resolveStaffAccess, isUuid, num, str } from "@/app/admin/staff/_lib/guard";
import { isAutoMetricKey } from "@/lib/admin/staff/metrics";

const STATUSES = new Set(["not_started", "on_track", "at_risk", "behind", "done"]);

// PATCH /api/admin/staff/:id/kpis/:kpiId — edit KPI config (title, target,
// cadence, unit, source binding). DELETE removes it (snapshots cascade).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; kpiId: string } }
) {
  if (!isUuid(params.id) || !isUuid(params.kpiId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const access = await resolveStaffAccess(params.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canView) return NextResponse.json({ error: "No access" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected JSON" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("title" in body) {
    const t = str(body.title, 200);
    if (!t) return NextResponse.json({ error: "Title can't be empty." }, { status: 400 });
    patch.title = t;
  }
  if ("unit" in body) patch.unit = str(body.unit, 40);
  if ("target" in body) patch.target = num(body.target);
  if ("cadence" in body) patch.cadence = str(body.cadence, 40);
  if ("status" in body && STATUSES.has(String(body.status))) patch.status = String(body.status);
  if ("sort_order" in body) patch.sort_order = num(body.sort_order) ?? 0;
  if ("source" in body) {
    const source = body.source === "auto" ? "auto" : "manual";
    patch.source = source;
    if (source === "auto") {
      const key = str(body.linked_metric_key, 80);
      if (!isAutoMetricKey(key)) {
        return NextResponse.json({ error: "Unknown auto-metric key." }, { status: 400 });
      }
      patch.linked_metric_key = key;
    } else {
      patch.linked_metric_key = null;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await access.supabase
    .from("staff_kpis")
    .update(patch)
    .eq("id", params.kpiId)
    .eq("staff_id", access.staff.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "KPI not found" }, { status: 404 });

  await audit(req, {
    action: "staff.kpi.update",
    entityType: "staff_kpis",
    entityId: params.kpiId,
    after: patch,
  });
  return NextResponse.json({ ok: true, kpi: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; kpiId: string } }
) {
  if (!isUuid(params.id) || !isUuid(params.kpiId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const access = await resolveStaffAccess(params.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canView) return NextResponse.json({ error: "No access" }, { status: 403 });

  const { error } = await access.supabase
    .from("staff_kpis")
    .delete()
    .eq("id", params.kpiId)
    .eq("staff_id", access.staff.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await audit(req, {
    action: "staff.kpi.delete",
    entityType: "staff_kpis",
    entityId: params.kpiId,
  });
  return NextResponse.json({ ok: true });
}
