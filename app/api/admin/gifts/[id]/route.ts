import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { audit } from "@/lib/audit";
import {
  EDITABLE_FIELDS,
  FIELD_LABEL,
  diffGift,
  lockedViolations,
  normalizeGiftPatch,
  receiptWasSent,
} from "@/lib/fundraising/giftEdit";

// PATCH / DELETE a single gift. The donor link itself is not reassigned here.
//
// V4 Stage B1 made gifts editable from the donor timeline (the gift drawer).
// The edit rules live in lib/fundraising/giftEdit.ts; in short: server-guarded
// with fundraising.write, scoped to the active org, synced gifts keep their
// amount/date/method, every edit is audited with the before and after of what
// changed, and a gift whose tax receipt already went out is never resent.

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

const GIFT_COLUMNS = `id, org_id, amount, gift_date, method, fund_id, campaign_id, appeal_id, fair_market_value, deductible_amount, notes, external_source`;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requirePermission("fundraising.write");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = createServerSupabase();
  // Read the row first: the audit needs the before, and the active org is the
  // fence (RLS alone spans every org the user belongs to).
  const { data: before, error: readErr } = await supabase
    .from("gifts")
    .select(GIFT_COLUMNS)
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: "Could not read the gift" }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Gift not found" }, { status: 404 });

  const update = normalizeGiftPatch(body, Number(before.amount));
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }
  const diff = diffGift(before as Record<string, unknown>, update);
  if (diff.changed.length === 0 && !("deductible_amount" in diff.after)) {
    // Nothing moved: no write and no audit row.
    return NextResponse.json({ ok: true, changed: [] });
  }
  const blocked = lockedViolations(before.external_source as string | null, diff.changed);
  if (blocked.length > 0) {
    return NextResponse.json(
      {
        error: `This gift came from ${before.external_source}. Change its ${blocked
          .map((f) => FIELD_LABEL[f].toLowerCase())
          .join(", ")} at the source; it would sync back here.`,
      },
      { status: 409 },
    );
  }

  // Write only what changed.
  const write: Record<string, unknown> = {};
  for (const f of EDITABLE_FIELDS) if (diff.changed.includes(f)) write[f] = update[f];
  if ("deductible_amount" in diff.after) write.deductible_amount = diff.after.deductible_amount;

  const { error } = await supabase.from("gifts").update(write).eq("id", params.id).eq("org_id", ctx.orgId);
  if (error) return NextResponse.json({ error: "Could not save the gift" }, { status: 500 });

  // Was a receipt already sent? The edit never resends; the response tells
  // the drawer so it can say so.
  const { data: acks } = await supabase
    .from("acknowledgments")
    .select("template, channel, sent_at")
    .eq("gift_id", params.id)
    .limit(50);
  const receiptSent = receiptWasSent((acks ?? []) as Array<{ template: string | null; channel: string | null; sent_at: string | null }>);

  await audit(req, {
    action: "fundraising.gift.update",
    entityType: "gifts",
    entityId: params.id,
    before: diff.before,
    after: { ...diff.after, receipt_already_sent: receiptSent },
  });
  return NextResponse.json({ ok: true, changed: diff.changed, receiptSent });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requirePermission("fundraising.write");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();

  // Only hand-entered gifts are deletable. Payment/CRM-sourced gifts
  // (Stripe, Givebutter, HubSpot deals) are real money that would re-sync
  // anyway — the correct action is to refund/void upstream, not delete here.
  const { data: gift } = await supabase
    .from("gifts")
    .select("external_source")
    .eq("id", params.id)
    .eq("org_id", gate.ctx.orgId)
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

  const { error } = await supabase.from("gifts").delete().eq("id", params.id).eq("org_id", gate.ctx.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.gift.delete",
    entityType: "gifts",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
