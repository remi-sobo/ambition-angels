import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { loadStewardshipRules } from "@/lib/fundraising/stewardship";
import { buildAckContext, type AckContextDonor, type AckContextGift } from "@/lib/admin/ackContext";

// GET /api/admin/acknowledgments/context?gift_id=… — everything the Needs-you
// acknowledgment panel shows for one pending gift (specs/needs-you-popout-
// thank-yous.md, PR 3). Read-only. Session client (RLS: fundraising.read) AND
// an explicit fence on the active org: RLS is permission-scoped, so an owner
// of several orgs could otherwise read another org's gift by id. A gift
// outside the active org is a 404, never a cross-tenant read.

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const giftId = req.nextUrl.searchParams.get("gift_id") ?? "";
  if (!isUuid(giftId)) return NextResponse.json({ error: "gift_id is required" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: gift, error } = await supabase
    .from("gifts")
    .select(
      "id, amount, gift_date, method, external_source, recurring_plan_id, notes, acknowledgment_status, constituent_id, campaign_id, fund_id, appeal_id",
    )
    .eq("id", giftId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (error) {
    console.error("[ack-context] gift read failed:", error.message);
    return NextResponse.json({ error: "Couldn't load this gift." }, { status: 500 });
  }
  if (!gift) return NextResponse.json({ error: "Gift not found" }, { status: 404 });

  const g = gift as AckContextGift & { campaign_id: string | null; fund_id: string | null; appeal_id: string | null };
  const name = async (table: "campaigns" | "funds" | "appeals", id: string | null) => {
    if (!id) return null;
    const { data } = await supabase.from(table).select("name").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
    return (data as { name: string } | null)?.name ?? null;
  };

  const [donorRes, historyRes, rules, campaign, fund, appeal] = await Promise.all([
    g.constituent_id
      ? supabase
          .from("constituents")
          .select("id, type, first_name, last_name, org_name, emails, preferred_ack_channel, do_not_contact, why_matters")
          .eq("id", g.constituent_id)
          .eq("org_id", ctx.orgId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    g.constituent_id
      ? supabase
          .from("gifts")
          .select("id, gift_date, amount")
          .eq("constituent_id", g.constituent_id)
          .eq("org_id", ctx.orgId)
          .limit(500)
      : Promise.resolve({ data: [{ id: g.id, gift_date: g.gift_date, amount: g.amount }], error: null }),
    loadStewardshipRules(supabase, ctx.orgId),
    name("campaigns", g.campaign_id),
    name("funds", g.fund_id),
    name("appeals", g.appeal_id),
  ]);

  const history = ((historyRes.data ?? []) as { id: string; gift_date: string; amount: number | string }[]).map((h) => ({
    id: h.id,
    gift_date: h.gift_date,
    amount: Number(h.amount) || 0,
  }));
  if (!history.some((h) => h.id === g.id)) history.push({ id: g.id, gift_date: g.gift_date, amount: Number(g.amount) });

  return NextResponse.json({
    context: buildAckContext({
      gift: { ...g, amount: Number(g.amount) },
      donor: (donorRes.data as AckContextDonor | null) ?? null,
      history,
      rules,
      names: { campaign, fund, appeal },
    }),
  });
}
