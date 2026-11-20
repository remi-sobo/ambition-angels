import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { sendsCsv, type SendRow } from "@/lib/comms/results";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// CSV of one campaign's sends (G3): who got it, what happened, opens, clicks.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("name")
    .eq("org_id", ctx.orgId)
    .eq("id", params.id)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("email_sends")
    .select("id, email, first_name, status, error, sent_at, open_count, click_count")
    .eq("org_id", ctx.orgId)
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, { action: "fundraising.campaign_email.export", entityType: "email_campaigns", entityId: params.id });
  const slug = String(campaign.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "campaign";
  return new Response(sendsCsv((data ?? []) as SendRow[]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-results.csv"`,
    },
  });
}
