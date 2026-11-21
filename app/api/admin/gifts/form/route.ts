import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { todayInTZ } from "@/lib/admin/ops/week";
import { constituentName } from "@/lib/fundraising/display";
import { lockedFields, receiptWasSent } from "@/lib/fundraising/giftEdit";

// GET /api/admin/gifts/form?constituent_id=&gift_id= — everything the gift
// drawer (V4 B1, GiftFlow.dc.html) needs to open: attribution options, the
// org-timezone today for the default date, the donor (prefilled when opened
// from a record) with their last payment method, and for an edit the gift,
// which of its fields are locked, and whether a tax receipt already went out.
// Read-only, user-session client, pinned to the active org.

export const dynamic = "force-dynamic";

const isUuid = (v: string | null): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v);

type Constituent = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[] | null;
  preferred_ack_channel: string | null;
};

export async function GET(req: NextRequest) {
  const gate = await requirePermission("fundraising.read");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const ctx = gate.ctx;
  const url = new URL(req.url);
  const giftId = url.searchParams.get("gift_id");
  let constituentId = url.searchParams.get("constituent_id");
  const supabase = createServerSupabase();

  const [fundsRes, campaignsRes, appealsRes] = await Promise.all([
    supabase.from("funds").select("id, name").eq("org_id", ctx.orgId).order("name").limit(100),
    supabase.from("campaigns").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(100),
    supabase.from("appeals").select("id, name").eq("org_id", ctx.orgId).order("name").limit(200),
  ]);

  let gift: Record<string, unknown> | null = null;
  let receiptSent = false;
  if (isUuid(giftId)) {
    const { data, error } = await supabase
      .from("gifts")
      .select(
        "id, constituent_id, amount, gift_date, method, fund_id, campaign_id, appeal_id, fair_market_value, notes, external_source, acknowledgment_status, acknowledged_at, recurring_plan_id",
      )
      .eq("id", giftId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Could not read the gift" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Gift not found" }, { status: 404 });
    gift = { ...data, amount: Number(data.amount), fair_market_value: data.fair_market_value == null ? null : Number(data.fair_market_value) };
    constituentId = (data.constituent_id as string | null) ?? null;
    const { data: acks } = await supabase
      .from("acknowledgments")
      .select("template, channel, sent_at")
      .eq("gift_id", giftId)
      .limit(50);
    receiptSent = receiptWasSent((acks ?? []) as Array<{ template: string | null; channel: string | null; sent_at: string | null }>);
  }

  let donor: { id: string; name: string; email: string | null; lastMethod: string | null; preferredAck: string | null } | null = null;
  if (isUuid(constituentId)) {
    const [cRes, lastRes] = await Promise.all([
      supabase
        .from("constituents")
        .select("id, type, first_name, last_name, org_name, emails, preferred_ack_channel")
        .eq("id", constituentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle(),
      supabase
        .from("gifts")
        .select("method")
        .eq("constituent_id", constituentId)
        .eq("org_id", ctx.orgId)
        .order("gift_date", { ascending: false })
        .limit(1),
    ]);
    const c = cRes.data as Constituent | null;
    if (c) {
      donor = {
        id: c.id,
        name: constituentName(c),
        email: c.emails?.[0] ?? null,
        lastMethod: ((lastRes.data ?? []) as Array<{ method: string }>)[0]?.method ?? null,
        preferredAck: c.preferred_ack_channel ?? null,
      };
    }
  }

  return NextResponse.json({
    today: todayInTZ(),
    options: {
      funds: fundsRes.data ?? [],
      campaigns: campaignsRes.data ?? [],
      appeals: appealsRes.data ?? [],
    },
    donor,
    gift,
    receiptSent,
    lockedFields: gift ? lockedFields(gift.external_source as string | null) : [],
  });
}
