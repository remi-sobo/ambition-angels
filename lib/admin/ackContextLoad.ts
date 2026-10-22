import "server-only";
import type { createServerSupabase } from "@/lib/supabase/server";
import { loadStewardshipRules } from "@/lib/fundraising/stewardship";
import { buildAckContext, type AckContext, type AckContextDonor, type AckContextGift } from "@/lib/admin/ackContext";

/**
 * Loads one pending gift's acknowledgment context (lib/admin/ackContext.ts)
 * for the active org: the context route shows it, the draft route prompts
 * from it. Session client (RLS: fundraising.read) AND an explicit org fence on
 * every read: RLS is permission-scoped, so an owner of several orgs could
 * otherwise read another org's gift by id. A gift outside `orgId` is a 404.
 */
export async function loadAckContext(
  supabase: ReturnType<typeof createServerSupabase>,
  orgId: string,
  giftId: string,
): Promise<{ status: 200; context: AckContext } | { status: 404 | 500 }> {
  const { data: gift, error } = await supabase
    .from("gifts")
    .select(
      "id, amount, gift_date, method, external_source, recurring_plan_id, notes, acknowledgment_status, constituent_id, campaign_id, fund_id, appeal_id",
    )
    .eq("id", giftId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) {
    console.error("[ack-context] gift read failed:", error.message);
    return { status: 500 };
  }
  if (!gift) return { status: 404 };

  const g = gift as AckContextGift & { campaign_id: string | null; fund_id: string | null; appeal_id: string | null };
  const name = async (table: "campaigns" | "funds" | "appeals", id: string | null) => {
    if (!id) return null;
    const { data } = await supabase.from(table).select("name").eq("id", id).eq("org_id", orgId).maybeSingle();
    return (data as { name: string } | null)?.name ?? null;
  };

  const [donorRes, historyRes, rules, campaign, fund, appeal] = await Promise.all([
    g.constituent_id
      ? supabase
          .from("constituents")
          .select("id, type, first_name, last_name, org_name, emails, preferred_ack_channel, do_not_contact, why_matters")
          .eq("id", g.constituent_id)
          .eq("org_id", orgId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    g.constituent_id
      ? supabase
          .from("gifts")
          .select("id, gift_date, amount")
          .eq("constituent_id", g.constituent_id)
          .eq("org_id", orgId)
          .limit(500)
      : Promise.resolve({ data: [{ id: g.id, gift_date: g.gift_date, amount: g.amount }], error: null }),
    loadStewardshipRules(supabase, orgId),
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

  return {
    status: 200,
    context: buildAckContext({
      gift: { ...g, amount: Number(g.amount) },
      donor: (donorRes.data as AckContextDonor | null) ?? null,
      history,
      rules,
      names: { campaign, fund, appeal },
    }),
  };
}
