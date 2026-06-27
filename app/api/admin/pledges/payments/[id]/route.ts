import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// PATCH a pledge installment: mark it paid (creates a real gift on the spine
// and links it), skip it, or reset it back to scheduled (removing the gift it
// created). The gift is the money; the payment is the expectation.

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const METHODS = ["card", "cash", "check", "ach", "in_kind", "stock", "other"] as const;
const todayISO = () => new Date().toISOString().slice(0, 10);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const action = body.action;
  if (action !== "paid" && action !== "skip" && action !== "reset") {
    return NextResponse.json({ error: "action must be paid/skip/reset" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: pay } = await supabase
    .from("pledge_payments")
    .select("id, pledge_id, expected_amount, due_date, status, gift_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!pay) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  if (action === "reset") {
    if (pay.gift_id) await supabase.from("gifts").delete().eq("id", pay.gift_id);
    await supabase
      .from("pledge_payments")
      .update({ status: "scheduled", gift_id: null, paid_at: null })
      .eq("id", pay.id);
    // A reset re-opens a pledge that had been auto-completed.
    await supabase.from("pledges").update({ status: "active" }).eq("id", pay.pledge_id).eq("status", "completed");
    await audit(req, { action: "fundraising.pledge_payment.reset", entityType: "pledge_payments", entityId: pay.id });
    return NextResponse.json({ ok: true });
  }

  if (action === "skip") {
    await supabase.from("pledge_payments").update({ status: "skipped" }).eq("id", pay.id);
    await audit(req, { action: "fundraising.pledge_payment.skip", entityType: "pledge_payments", entityId: pay.id });
    return NextResponse.json({ ok: true });
  }

  // action === "paid": create the gift, link it, mark paid.
  if (pay.status === "paid") return NextResponse.json({ error: "Already paid" }, { status: 409 });
  const { data: pledge } = await supabase
    .from("pledges")
    .select("constituent_id, campaign_id, fund_id")
    .eq("id", pay.pledge_id)
    .maybeSingle();
  if (!pledge) return NextResponse.json({ error: "Pledge not found" }, { status: 404 });

  const method = METHODS.includes(body.method as (typeof METHODS)[number]) ? body.method : "check";
  const giftDate = typeof body.gift_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.gift_date) ? body.gift_date : todayISO();
  const { data: gift, error: gErr } = await supabase
    .from("gifts")
    .insert({
      // Stamp org_id from session — never ride the AA column default (org_id trap).
      org_id: ctx.orgId,
      constituent_id: pledge.constituent_id,
      amount: Number(pay.expected_amount),
      gift_date: giftDate,
      method,
      campaign_id: pledge.campaign_id,
      fund_id: pledge.fund_id,
      external_source: "pledge",
    })
    .select("id")
    .single();
  if (gErr || !gift) {
    console.error("[pledge_payments] gift create failed:", gErr?.message);
    return NextResponse.json({ error: "Could not record the gift" }, { status: 500 });
  }

  await supabase
    .from("pledge_payments")
    .update({ status: "paid", gift_id: gift.id, paid_at: new Date().toISOString() })
    .eq("id", pay.id);

  // Auto-complete the pledge when no installment is still scheduled.
  const { count: remaining } = await supabase
    .from("pledge_payments")
    .select("id", { count: "exact", head: true })
    .eq("pledge_id", pay.pledge_id)
    .eq("status", "scheduled");
  if ((remaining ?? 0) === 0) {
    await supabase.from("pledges").update({ status: "completed" }).eq("id", pay.pledge_id);
  }

  await audit(req, {
    action: "fundraising.pledge_payment.paid",
    entityType: "pledge_payments",
    entityId: pay.id,
    after: { gift_id: gift.id, amount: Number(pay.expected_amount) },
  });
  return NextResponse.json({ ok: true, gift_id: gift.id });
}
