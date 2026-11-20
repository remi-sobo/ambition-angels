import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { personalize } from "@/lib/fundraising/comms-email";
import { extractLinks, isTrackingToken } from "@/lib/comms/links";
import { appOrigin } from "@/lib/origins";

// Click redirect (specs/comms-v2-gmail-amendment.md G3). The destination is
// link n of the campaign body the send was rendered from (same personalized
// text, same extractor), so the URL never comes from the request and this
// can't be used as an open redirect. Stores no reader data.
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { token: string; n: string } }) {
  const fallback = NextResponse.redirect(appOrigin(), 302);
  const index = Number(params.n);
  if (!isTrackingToken(params.token) || !Number.isInteger(index) || index < 0 || index > 500) return fallback;

  const admin = getSupabaseAdmin();
  const { data: send } = await admin
    .from("email_sends")
    .select("campaign_id, org_id, first_name")
    .eq("tracking_token", params.token)
    .maybeSingle();
  if (!send) return fallback;

  const { data: campaign } = await admin
    .from("email_campaigns")
    .select("body")
    .eq("org_id", send.org_id)
    .eq("id", send.campaign_id)
    .maybeSingle();
  if (!campaign) return fallback;

  const url = extractLinks(personalize(campaign.body as string, (send.first_name as string | null) ?? ""))[index];
  if (!url || !/^https?:\/\//i.test(url)) return fallback;

  const { error } = await admin.rpc("record_email_click", { p_token: params.token, p_index: index, p_url: url });
  if (error) console.error("[track/click] failed:", error.message);
  return NextResponse.redirect(url, 302);
}
