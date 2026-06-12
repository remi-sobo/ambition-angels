import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Bulk attribution: assign every UNATTRIBUTED gift in a date range to a
 * campaign. Deliberately never reassigns — gifts that already carry a
 * campaign are left alone, so re-running with overlapping ranges is safe.
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const campaignId =
    body && typeof body.campaign_id === "string" && /^[0-9a-f-]{36}$/i.test(body.campaign_id)
      ? body.campaign_id
      : null;
  if (!campaignId || !isISODate(body?.from) || !isISODate(body?.to)) {
    return NextResponse.json(
      { error: "campaign_id, from (YYYY-MM-DD) and to are required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { data: updated, error } = await supabase
    .from("gifts")
    .update({ campaign_id: campaignId })
    .is("campaign_id", null)
    .gte("gift_date", body!.from as string)
    .lte("gift_date", body!.to as string)
    .select("id");
  if (error) {
    console.error("Bulk attribute failed:", error.message);
    return NextResponse.json({ error: "Attribution failed" }, { status: 500 });
  }

  const count = updated?.length ?? 0;
  await audit(req, {
    action: "fundraising.gifts.attribute",
    entityType: "campaign",
    entityId: campaignId,
    after: { campaign: campaign.name, from: body!.from, to: body!.to, gifts: count },
  });
  return NextResponse.json({ count });
}
