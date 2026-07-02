import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { resolveRecipients } from "@/lib/fundraising/segments";
import { personalize, buildCampaignEmail } from "@/lib/fundraising/comms-email";
import { loadOrgCommsSettings, sendBlocker } from "@/lib/comms/settings";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// Send a single preview of a campaign to a chosen address. No email_sends row;
// subject is prefixed [TEST]. Personalizes against a real sample recipient
// (the segment's first resolved recipient) so a proof shows what a donor will
// actually get — merge-field fallbacks included — not placeholder data.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const to = typeof body?.email === "string" ? body.email.trim() : "";
  if (!to) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Email is not configured" }, { status: 500 });

  const supabase = createServerSupabase();
  const { data: c } = await supabase
    .from("email_campaigns")
    .select("subject, body, segment_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await loadOrgCommsSettings(supabase, ctx.orgId);
  const blocked = sendBlocker(settings);
  if (blocked || !settings) return NextResponse.json({ error: blocked }, { status: 409 });

  // Sample recipient: first resolved recipient of the attached segment,
  // falling back to a generic greeting when there's no segment (or no match).
  let sampleFirstName = "there";
  if (c.segment_id) {
    const { data: seg } = await supabase.from("segments").select("definition").eq("id", c.segment_id).maybeSingle();
    if (seg) {
      const { recipients } = await resolveRecipients(supabase, (seg.definition ?? {}) as Record<string, string>);
      if (recipients[0]) sampleFirstName = recipients[0].firstName;
    }
  }

  // constituentId stays null: a test copy must never carry a live unsubscribe
  // token for a real donor — one stray click would suppress them.
  const payload = buildCampaignEmail({
    settings,
    to,
    subject: `[TEST] ${c.subject as string}`,
    bodyText: personalize(c.body as string, sampleFirstName),
    constituentId: null,
    campaignId: params.id,
  });
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send(payload);
    if (error) throw new Error(error.message);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  await audit(req, { action: "fundraising.campaign_email.test", entityType: "email_campaigns", entityId: params.id, after: { to } });
  return NextResponse.json({ ok: true });
}
