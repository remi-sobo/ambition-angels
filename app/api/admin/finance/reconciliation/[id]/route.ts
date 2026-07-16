import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// PATCH /api/admin/finance/reconciliation/[id] — { action: 'accept' | 'dismiss' }
// Accepting a 'commitment' item applies its payload to fin_revenue_commitments
// (the only point where reconciliation proposals enter the real ledger).
// Accepting a 'flag' just acknowledges it. Dismiss closes without applying.

const SOURCE_TYPES = ["foundation", "individual", "corporate", "government", "accelerator", "earned", "other"] as const;
const STATUSES = ["secured", "projected", "received"] as const;
const isISODate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getAdminUser();
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action === "accept" || body?.action === "dismiss" ? body.action : "";
  if (!action) return NextResponse.json({ error: "action must be accept or dismiss" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: item } = await supabase
    .from("fin_reconciliation_items")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.status !== "pending") return NextResponse.json({ error: "Already resolved" }, { status: 409 });

  let appliedId: string | null = null;

  if (action === "accept" && item.kind === "commitment") {
    // Validate the proposed pledge the same way the manual revenue route does.
    const p = (item.payload ?? {}) as Record<string, unknown>;
    const year = typeof p.year === "number" && Number.isInteger(p.year) ? p.year : new Date().getFullYear();
    const source_type = SOURCE_TYPES.includes(p.source_type as (typeof SOURCE_TYPES)[number]) ? (p.source_type as string) : "";
    const source_name = typeof p.source_name === "string" ? p.source_name.trim() : "";
    const amount = typeof p.amount === "number" && Number.isFinite(p.amount) ? p.amount : NaN;
    const status = STATUSES.includes(p.status as (typeof STATUSES)[number]) ? (p.status as string) : "";
    if (!source_type || !source_name || !Number.isFinite(amount) || amount < 0 || !status) {
      return NextResponse.json({ error: "Proposed commitment is incomplete — edit it on the Pledges tab instead." }, { status: 422 });
    }
    const insert: Record<string, unknown> = {
      org_id: ctx.orgId,
      year,
      source_type,
      source_name,
      amount: Math.round(amount * 100) / 100,
      status,
      created_by: user,
      notes: typeof p.notes === "string" ? p.notes.slice(0, 1000) : `Reconciled from ${item.source}`,
    };
    if (isISODate(p.expected_date)) insert.expected_date = p.expected_date;
    if (typeof p.probability === "number" && p.probability >= 0 && p.probability <= 1) insert.probability = p.probability;
    if (typeof p.restricted === "boolean") insert.restricted = p.restricted;
    if (typeof p.restricted_to === "string" && p.restricted_to.trim()) insert.restricted_to = p.restricted_to.slice(0, 200);

    const { data: pledge, error } = await supabase.from("fin_revenue_commitments").insert(insert).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    appliedId = (pledge as { id: string }).id;
  }

  const newStatus = action === "accept" ? "accepted" : "dismissed";
  const { data: updated, error: updErr } = await supabase
    .from("fin_reconciliation_items")
    .update({ status: newStatus, resolved_by: user, resolved_at: new Date().toISOString(), applied_id: appliedId })
    .eq("id", params.id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await audit(req, {
    action: `finance.reconciliation.${action}`,
    entityType: "fin_reconciliation_items",
    entityId: params.id,
    after: { status: newStatus, applied_id: appliedId },
  });

  return NextResponse.json({ ok: true, item: updated, applied_id: appliedId });
}
