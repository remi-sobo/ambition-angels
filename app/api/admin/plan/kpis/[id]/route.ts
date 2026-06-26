import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const SOURCES = ["auto", "manual"] as const;
const STATUSES = ["not_started", "on_track", "at_risk", "behind", "done"] as const;
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const numOrNull = (v: unknown): number | null | undefined =>
  v === null ? null : typeof v === "number" && Number.isFinite(v) ? v : undefined;
const textOrNull = (v: unknown, max: number): string | null | undefined =>
  v === null || v === "" ? null : typeof v === "string" ? v.trim().slice(0, max) : undefined;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim())
    update.title = body.title.trim().slice(0, 300);
  if (STATUSES.includes(body.status as (typeof STATUSES)[number])) update.status = body.status;
  if (SOURCES.includes(body.source as (typeof SOURCES)[number])) update.source = body.source;
  for (const [field, max] of [["unit", 40], ["owner", 60], ["cadence", 40], ["metric_key", 80]] as const) {
    if (field in body) {
      const v = textOrNull(body[field], max);
      if (v !== undefined) update[field] = v;
    }
  }
  if ("target" in body) {
    const v = numOrNull(body.target);
    if (v !== undefined) update.target = v;
  }
  if ("baseline" in body) {
    const v = numOrNull(body.baseline);
    if (v !== undefined) update.baseline = v;
  }
  if ("baseline_date" in body) {
    const v = body.baseline_date;
    if (v === null || v === "") update.baseline_date = null;
    else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) update.baseline_date = v;
  }
  if ("current" in body) {
    const v = numOrNull(body.current);
    if (v !== undefined) {
      update.current = v;
      // A manual measurement just landed — stamp it so the cockpit can show
      // staleness later.
      update.last_updated_at = new Date().toISOString();
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("plan_kpis").select("*").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("plan_kpis").update(update).eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) {
    console.error("Update KPI failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  // Snapshot a manual value change so the scorecard trend keeps building.
  if (typeof update.current === "number") {
    await supabase.from("plan_kpi_snapshots").upsert(
      { org_id: ctx.orgId, kpi_id: params.id, captured_on: new Date().toISOString().slice(0, 10), value: update.current },
      { onConflict: "kpi_id,captured_on" }
    );
  }
  await audit(req, {
    action: "governance.kpi.update",
    entityType: "plan_kpi",
    entityId: params.id,
    before,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase
    .from("plan_kpis").select("*").eq("id", params.id).eq("org_id", ctx.orgId).maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("plan_kpis").delete().eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) {
    console.error("Delete KPI failed:", error.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  await audit(req, {
    action: "governance.kpi.delete",
    entityType: "plan_kpi",
    entityId: params.id,
    before,
  });
  return NextResponse.json({ ok: true });
}
