import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";

// POST /api/admin/finance/reconciliation — create (or refresh) a proposed
// ledger entry in the reconciliation inbox. Used by the Cowork weekly sweep and
// by on-demand pushes. Idempotent per (source, source_ref): a re-run updates the
// existing pending proposal instead of duplicating it.

const KINDS = ["commitment", "flag"] as const;
const SOURCES = ["hubspot", "gmail", "stripe", "manual"] as const;
const CONFIDENCE = ["high", "medium", "low"] as const;

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getAdminUser();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const kind = KINDS.includes(body.kind as (typeof KINDS)[number]) ? (body.kind as string) : "";
  const source = SOURCES.includes(body.source as (typeof SOURCES)[number]) ? (body.source as string) : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  if (!kind) return NextResponse.json({ error: "kind is invalid" }, { status: 400 });
  if (!source) return NextResponse.json({ error: "source is invalid" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const row: Record<string, unknown> = {
    org_id: ctx.orgId,
    kind,
    source,
    title,
    source_ref: typeof body.source_ref === "string" ? body.source_ref.slice(0, 200) : null,
    detail: typeof body.detail === "string" ? body.detail.slice(0, 2000) : null,
    amount: typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : null,
    payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    evidence_url: typeof body.evidence_url === "string" ? body.evidence_url.slice(0, 500) : null,
    confidence: CONFIDENCE.includes(body.confidence as (typeof CONFIDENCE)[number]) ? (body.confidence as string) : null,
    created_by: typeof body.created_by === "string" ? body.created_by : user ?? "agent",
  };

  const supabase = getSupabaseAdmin();

  // Dedup: refresh an existing pending proposal for the same source item.
  if (row.source_ref) {
    const { data: existing } = await supabase
      .from("fin_reconciliation_items")
      .select("id")
      .eq("source", source)
      .eq("source_ref", row.source_ref)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      const { data, error } = await supabase
        .from("fin_reconciliation_items")
        .update({ kind, title, detail: row.detail, amount: row.amount, payload: row.payload, evidence_url: row.evidence_url, confidence: row.confidence })
        .eq("id", (existing as { id: string }).id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, item: data, updated: true });
    }
  }

  const { data, error } = await supabase.from("fin_reconciliation_items").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
