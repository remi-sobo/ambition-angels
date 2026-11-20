import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { cancelCampaign } from "@/lib/comms/queue";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// Cancel a scheduled or sending campaign (G2). Emails already sent stay sent;
// everything still waiting is marked skipped.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  if (!(await ctxHasPermission(ctx, "comms.send"))) {
    return NextResponse.json({ error: "Your role can't cancel a send." }, { status: 403 });
  }
  const result = await cancelCampaign(createServerSupabase(), ctx.orgId, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await audit(req, {
    action: "fundraising.campaign_email.cancel",
    entityType: "email_campaigns",
    entityId: params.id,
    after: { skipped: result.skipped },
  });
  return NextResponse.json(result);
}
