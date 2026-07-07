import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { resolveStaffAccess, isUuid } from "@/app/admin/staff/_lib/guard";
import { refreshStaffKpis } from "@/lib/admin/staff/metrics";

// POST /api/admin/staff/:id/kpis/refresh — recompute every auto KPI for this
// person from the BloomOS spine (no hand entry). Session client only; the
// resolvers read org-scoped data the caller can already see.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const access = await resolveStaffAccess(params.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canView) return NextResponse.json({ error: "No access" }, { status: 403 });

  const today = new Date().toISOString().slice(0, 10);
  const refreshed = await refreshStaffKpis(access.supabase, access.staff.id, today);

  await audit(req, {
    action: "staff.kpi.refresh",
    entityType: "staff",
    entityId: access.staff.id,
    after: { refreshed },
  });
  return NextResponse.json({ ok: true, refreshed });
}
