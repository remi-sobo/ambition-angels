import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// POST /api/admin/metrics/[id]/snapshot — manual value entry for a metric.
// { value: number, captured_on?: YYYY-MM-DD (default today), note?: string }
//
// The snapshot insert goes through the SESSION client: metrics.write RLS is
// the authority, and captured_by is the caller's uuid (the catalog's owner
// column done right). Corrections are new snapshots with a note — same-day
// re-entry updates that day's point rather than erroring.
//
// Transition guard (spec failure mode #1): until the Phase 4 read-swap is
// everywhere, plan_kpis.current must not diverge from the catalog. When this
// metric is linked from plan_kpis, the same request syncs current /
// last_updated_at and the plan-side snapshot via the service role (plan_kpis
// writes are gated org.manage, which staff correctly lack — the authorized
// catalog write is what admits the sync).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as
    | { value?: unknown; captured_on?: unknown; note?: unknown }
    | null;
  const value = typeof body?.value === "number" && Number.isFinite(body.value) ? body.value : null;
  if (value === null) return NextResponse.json({ error: "value must be a number" }, { status: 400 });
  const capturedOn = isISODate(body?.captured_on) ? body!.captured_on as string : new Date().toISOString().slice(0, 10);
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const supabase = createServerSupabase();

  // The definition must be visible to the caller (org scope via RLS).
  const { data: def } = await supabase
    .from("metric_definitions")
    .select("id, org_id, metric_key, source_kind")
    .eq("id", params.id)
    .maybeSingle();
  if (!def) return NextResponse.json({ error: "Metric not found" }, { status: 404 });

  const rounded = Math.round(value * 100) / 100;
  const { data: snap, error } = await supabase
    .from("metric_snapshots")
    .upsert(
      {
        org_id: def.org_id,
        metric_id: def.id,
        captured_on: capturedOn,
        value: rounded,
        captured_by: ctx.userId,
        note,
      },
      { onConflict: "metric_id,captured_on" },
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync the plan side when this metric backs a scorecard KPI. Only if this
  // snapshot is the metric's newest — backdated corrections must not clobber
  // a fresher current value.
  const { data: newest } = await supabase
    .from("metric_snapshots")
    .select("captured_on")
    .eq("metric_id", def.id)
    .order("captured_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (newest?.captured_on === capturedOn) {
    const admin = getSupabaseAdmin();
    // Org fence: service-role client bypasses RLS — scope to the caller's org.
    const { data: kpi } = await admin
      .from("plan_kpis")
      .select("id")
      .eq("metric_id", def.id)
      .eq("org_id", def.org_id)
      .maybeSingle();
    if (kpi) {
      await admin
        .from("plan_kpis")
        .update({ current: rounded, last_updated_at: new Date().toISOString() })
        .eq("org_id", ctx.orgId)
        .eq("id", kpi.id);
      await admin
        .from("plan_kpi_snapshots")
        .upsert(
          { org_id: def.org_id, kpi_id: kpi.id, captured_on: capturedOn, value: rounded },
          { onConflict: "kpi_id,captured_on" },
        );
    }
  }

  await audit(req, {
    action: "metrics.snapshot",
    entityType: "metric",
    entityId: def.id,
    after: { metric_key: def.metric_key, value: rounded, captured_on: capturedOn },
  });
  return NextResponse.json({ ok: true, snapshot: snap });
}
