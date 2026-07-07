import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { resolveStaffAccess, isUuid, num, str } from "@/app/admin/staff/_lib/guard";
import { kpiStatusFor } from "@/lib/admin/staff/metrics";

// POST /api/admin/staff/:id/kpis/:kpiId/snapshot — record a value for a (manual)
// KPI. Updates current + derived status + last_updated_at and upserts the dated
// snapshot so the trend line grows. Session client only.
export async function POST(
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
  const value = num(body?.value);
  if (value == null) return NextResponse.json({ error: "A numeric value is required." }, { status: 400 });
  const captured_on = str(body?.captured_on, 10) ?? new Date().toISOString().slice(0, 10);

  const { data: kpi } = await access.supabase
    .from("staff_kpis")
    .select("id, org_id, target")
    .eq("id", params.kpiId)
    .eq("staff_id", access.staff.id)
    .maybeSingle();
  if (!kpi) return NextResponse.json({ error: "KPI not found" }, { status: 404 });
  const row = kpi as { id: string; org_id: string; target: number | null };

  const status = kpiStatusFor(value, row.target, "up");
  const { error: upErr } = await access.supabase
    .from("staff_kpis")
    .update({ current: value, status, last_updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { error: snapErr } = await access.supabase
    .from("staff_kpi_snapshots")
    .upsert(
      { org_id: row.org_id, kpi_id: row.id, captured_on, value },
      { onConflict: "kpi_id,captured_on" }
    );
  if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 400 });

  await audit(req, {
    action: "staff.kpi.snapshot",
    entityType: "staff_kpis",
    entityId: row.id,
    after: { captured_on, value },
  });
  return NextResponse.json({ ok: true });
}
