import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Spec Home, stage H1 — Today's write path. A thin pass-through to the A3
 * SECURITY DEFINER RPCs (resolve_obligation / snooze_obligation), called on
 * the SESSION client so auth.uid() is the caller and the RPCs' own
 * per-branch permission checks are the authority — this route re-implements
 * nothing. One write here drops the row from Today, /admin/ops, and Reed's
 * queue tool alike (Contract 3; Spec A DoD #1).
 */

const SOURCES = new Set([
  "ops_task", "grant_requirement", "compliance_item", "acknowledgment",
  "reconciliation_item", "document_renewal", "metric_stale",
  "application_pending", "session_unrecorded",
]);
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    action?: unknown; source?: unknown; sourceId?: unknown; until?: unknown;
  } | null;
  const action = body?.action;
  if (action !== "resolve" && action !== "snooze") {
    return NextResponse.json({ error: "action must be 'resolve' or 'snooze'" }, { status: 400 });
  }
  if (typeof body?.source !== "string" || !SOURCES.has(body.source)) {
    return NextResponse.json({ error: "Unknown obligation source" }, { status: 400 });
  }
  if (!isUuid(body?.sourceId)) {
    return NextResponse.json({ error: "sourceId must be a uuid" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  let rpc;
  if (action === "resolve") {
    rpc = await supabase.rpc("resolve_obligation", {
      p_source: body.source,
      p_source_id: body.sourceId,
    });
  } else {
    if (!isISODate(body?.until)) {
      return NextResponse.json({ error: "until must be YYYY-MM-DD" }, { status: 400 });
    }
    rpc = await supabase.rpc("snooze_obligation", {
      p_source: body.source,
      p_source_id: body.sourceId,
      p_until: body.until,
    });
  }

  if (rpc.error) {
    // The RPCs raise insufficient_privilege for permission denials and
    // raise_exception for unresolvable/unsnoozable arms — surface both as
    // client errors, not 500s.
    const msg = rpc.error.message;
    const denied = /insufficient_privilege|permission/i.test(msg);
    return NextResponse.json({ error: msg }, { status: denied ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, result: rpc.data ?? null });
}
