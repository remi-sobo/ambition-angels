import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getWaivers } from "@/lib/admin/metrics/exportGate";
import { audit } from "@/lib/audit";

/**
 * Spec A, stage A5 — the Contract 7 waiver write. A holder of reports.approve
 * ships an artifact past a blocked metric; the waiver names the item, the
 * person, and the time, travels with the artifact (export_waivers row), and
 * pairs with an audit_log entry (DoD #8).
 *
 * The insert goes through the SESSION client on purpose: the export_waivers
 * insert policy (`has_permission(org_id, 'reports.approve')`, A1) is the
 * authority — this route never re-implements the permission check, so a
 * role/permission change stays a data change. org_id comes from session
 * context, never a column default (the org_id-trap rule). Append-only: no
 * update/delete here, and no RLS policy allows one.
 */

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    artifact_type?: unknown;
    artifact_id?: unknown;
    metric_key?: unknown;
    reason?: unknown;
  } | null;
  const artifactType = str(body?.artifact_type, 60);
  const artifactId = str(body?.artifact_id, 120);
  const metricKey = str(body?.metric_key, 120); // null = a non-metric item
  const reason = str(body?.reason, 1000);
  if (!artifactType || !artifactId) {
    return NextResponse.json(
      { error: "artifact_type and artifact_id are required" },
      { status: 400 },
    );
  }

  const supabase = createServerSupabase();
  const { data: waiver, error } = await supabase
    .from("export_waivers")
    .insert({
      org_id: ctx.orgId,
      artifact_type: artifactType,
      artifact_id: artifactId,
      metric_key: metricKey,
      waived_by: ctx.userId,
      reason,
    })
    .select("id, artifact_type, artifact_id, metric_key, waived_by, waived_at, reason")
    .single();
  if (error) {
    // RLS denial surfaces as an insert error — the caller lacks
    // reports.approve (owner + admin only, Spec A open decision 3).
    const denied = /row-level security/i.test(error.message);
    return NextResponse.json(
      { error: denied ? "reports.approve required to waive an export block" : error.message },
      { status: denied ? 403 : 500 },
    );
  }

  await audit(req, {
    action: "reports.export.waived",
    entityType: "export_waiver",
    entityId: waiver.id,
    after: {
      artifact_type: artifactType,
      artifact_id: artifactId,
      metric_key: metricKey,
      reason,
      waived_by: ctx.userId,
    },
  });
  return NextResponse.json({ ok: true, waiver });
}

/** GET ?artifact_type=…&artifact_id=… — the artifact's waivers
 *  (reports.read RLS via the session client). */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const artifactType = str(req.nextUrl.searchParams.get("artifact_type"), 60);
  const artifactId = str(req.nextUrl.searchParams.get("artifact_id"), 120);
  if (!artifactType || !artifactId) {
    return NextResponse.json(
      { error: "artifact_type and artifact_id are required" },
      { status: 400 },
    );
  }
  return NextResponse.json({ waivers: await getWaivers(artifactType, artifactId) });
}
