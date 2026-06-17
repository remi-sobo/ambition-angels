import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// PATCH / DELETE a single gift. Editing and removing hand-entered (or
// mis-keyed) gifts; the donor link itself is not reassigned here.

const METHODS = ["card", "cash", "check", "ach", "in_kind", "stock", "other"] as const;
const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const money = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  const amount = money(body.amount);
  if (amount !== null && amount > 0) update.amount = amount;
  if (isISODate(body.gift_date)) update.gift_date = body.gift_date;
  if (METHODS.includes(body.method as (typeof METHODS)[number])) update.method = body.method;
  if (isUuid(body.fund_id) || body.fund_id === null) update.fund_id = body.fund_id;
  if (isUuid(body.campaign_id) || body.campaign_id === null) update.campaign_id = body.campaign_id;
  if (isUuid(body.appeal_id) || body.appeal_id === null) update.appeal_id = body.appeal_id;
  const fmv = money(body.fair_market_value);
  if (fmv !== null) {
    update.fair_market_value = fmv > 0 ? fmv : null;
    if (fmv > 0 && amount !== null) {
      update.deductible_amount = Math.max(0, Math.round((amount - fmv) * 100) / 100);
    } else if (fmv === 0) {
      update.deductible_amount = null;
    }
  }
  if (typeof body.notes === "string") update.notes = body.notes.slice(0, 2000) || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("gifts").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.gift.update",
    entityType: "gifts",
    entityId: params.id,
    after: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();

  // Only hand-entered gifts are deletable. Payment/CRM-sourced gifts
  // (Stripe, Givebutter, HubSpot deals) are real money that would re-sync
  // anyway — the correct action is to refund/void upstream, not delete here.
  const { data: gift } = await supabase
    .from("gifts")
    .select("external_source")
    .eq("id", params.id)
    .maybeSingle();
  if (!gift) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const synced = ["stripe", "givebutter", "hubspot_deal"];
  if (gift.external_source && synced.includes(gift.external_source)) {
    return NextResponse.json(
      {
        error: `This is a synced ${gift.external_source} gift. Refund or void it at the source; it can't be deleted here.`,
        source: gift.external_source,
      },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("gifts").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.gift.delete",
    entityType: "gifts",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
