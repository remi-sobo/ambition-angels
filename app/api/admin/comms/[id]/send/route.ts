import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { startCampaign } from "@/lib/comms/queue";
import { parseScheduleAt } from "@/lib/comms/queue-plan";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// Send now or schedule a draft campaign (G2). This only queues: one pending
// email_sends row per recipient. The every-minute worker
// (/api/cron/comms-queue) sends them within each org's daily cap, carrying
// the rest over to the next day. Body: { scheduled_at?: ISO string }.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  if (!(await ctxHasPermission(ctx, "comms.send"))) {
    return NextResponse.json({ error: "Your role can draft campaigns but not send them." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const schedule = parseScheduleAt(body.scheduled_at);
  if (schedule.error) return NextResponse.json({ error: schedule.error }, { status: 400 });

  const result = await startCampaign(createServerSupabase(), ctx.orgId, params.id, schedule.at);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await audit(req, {
    action: schedule.at ? "fundraising.campaign_email.schedule" : "fundraising.campaign_email.send",
    entityType: "email_campaigns",
    entityId: params.id,
    after: { queued: result.queued, scheduled_at: result.scheduledAt, excluded: result.excluded },
  });
  return NextResponse.json(result);
}
