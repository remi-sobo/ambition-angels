import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { upsertFinConfig } from "@/lib/admin/finance";
import { CLOSE_ARTIFACT_TYPE, closeBlocked, periodKey } from "@/lib/finance/closeGate";
import { audit } from "@/lib/audit";

// POST /api/admin/finance/close
//
// Stamps the end of the Friday reconciliation ritual. Sets
// fin_config.last_reconciled_at = now() so every finance surface can show
// "reconciled as of <date>". It does NOT touch the balance, baseline, or any
// transaction — those are set in their own steps; this just records that the
// close was run to completion.
//
// Contract-7 gated as of Spec Finance N1: a period close is an EXIT, and
// pending reconciliation proposals block it. A reports.approve holder waives
// through POST /api/admin/export-waivers (artifact_type 'period_close',
// artifact_id the month key) — that route's RLS is the permission authority,
// this one only re-checks — and the waiver travels with the period: it is
// looked up by month, so last month's waiver never covers this one. The
// blocked response tells the wizard what stands in the way; nothing else
// about the ritual is blocked (Contract 7 rule 1 — only the exit).
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = periodKey(new Date().toISOString());
  // Org fence: the service-role client bypasses RLS, so both gate reads are
  // scoped to the active org explicitly (the house caveat).
  const admin = getSupabaseAdmin();
  const [pendingRes, waiverRes] = await Promise.all([
    admin
      .from("fin_reconciliation_items")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("status", "pending"),
    admin
      .from("export_waivers")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("artifact_type", CLOSE_ARTIFACT_TYPE)
      .eq("artifact_id", period)
      .is("metric_key", null)
      .order("waived_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const pending = pendingRes.count ?? 0;
  const waiverId = waiverRes.data?.id ?? null;

  if (closeBlocked(pending, waiverId !== null)) {
    return NextResponse.json(
      {
        error: `${pending} reconciliation proposal${pending === 1 ? "" : "s"} still pending — resolve them, or waive with reports.approve.`,
        blocked: true,
        pending,
        period,
        artifact_type: CLOSE_ARTIFACT_TYPE,
      },
      { status: 409 },
    );
  }

  const update = { last_reconciled_at: new Date().toISOString() };

  const { data, error } = await upsertFinConfig(ctx.orgId, update);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  await audit(req, {
    action: "finance.close",
    entityType: "fin_config",
    after: {
      ...update,
      period,
      pending_at_close: pending,
      ...(waiverId ? { waiver_id: waiverId } : {}),
    },
  });
  return NextResponse.json({ ok: true, last_reconciled_at: data.last_reconciled_at });
}
