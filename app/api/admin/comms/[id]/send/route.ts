import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { resolveRecipients } from "@/lib/fundraising/segments";
import { personalize, campaignHtml, campaignText } from "@/lib/fundraising/comms-email";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const CAP = 2000; // per-send recipient ceiling; durable batching is a follow-up
const CHUNK = 25;

// Send a draft campaign to its segment. Resolves recipients (segment filter +
// has-email + not do-not-contact), records a per-recipient ledger, and flips
// the campaign to sent. Idempotent guard: only a draft can be sent.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Email is not configured" }, { status: 500 });

  const supabase = createServerSupabase();
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("id, subject, body, segment_id, status")
    .eq("id", params.id)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status !== "draft") return NextResponse.json({ error: "Campaign already sent" }, { status: 409 });
  if (!campaign.segment_id) return NextResponse.json({ error: "Attach a segment first" }, { status: 400 });

  const { data: seg } = await supabase.from("segments").select("definition").eq("id", campaign.segment_id).maybeSingle();
  if (!seg) return NextResponse.json({ error: "Segment not found" }, { status: 400 });

  const recipients = await resolveRecipients(supabase, (seg.definition ?? {}) as Record<string, string>);
  if (recipients.length === 0) return NextResponse.json({ error: "Segment has no emailable recipients" }, { status: 400 });
  if (recipients.length > CAP) {
    return NextResponse.json({ error: `Segment resolves to ${recipients.length} recipients (cap ${CAP}). Narrow it first.` }, { status: 400 });
  }

  // Claim the campaign so a double-submit can't double-send.
  const { data: claimed } = await supabase
    .from("email_campaigns")
    .update({ status: "sending", recipient_count: recipients.length })
    .eq("id", campaign.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: "Campaign already sending/sent" }, { status: 409 });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const subject = campaign.subject as string;
  const bodyTpl = campaign.body as string;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      chunk.map((r) => {
        const text = personalize(bodyTpl, r.firstName);
        return resend.emails.send({
          from: "Ambition Angels <careers@mail.ambitionangels.org>",
          to: r.email,
          subject,
          html: campaignHtml(text, r.id),
          text: campaignText(text, r.id),
        });
      })
    );
    const rows = chunk.map((r, idx) => {
      const ok = results[idx].status === "fulfilled";
      if (ok) sent += 1; else failed += 1;
      return {
        campaign_id: campaign.id,
        constituent_id: r.id,
        email: r.email,
        status: ok ? "sent" : "failed",
        error: ok ? null : String((results[idx] as PromiseRejectedResult).reason).slice(0, 500),
        sent_at: ok ? new Date().toISOString() : null,
      };
    });
    // Ledger rows; ignore dupes if a recipient appears twice in a segment.
    await supabase.from("email_sends").upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true });
  }

  await supabase
    .from("email_campaigns")
    .update({ status: "sent", sent_at: new Date().toISOString(), sent_count: sent, failed_count: failed })
    .eq("id", campaign.id);

  await audit(req, {
    action: "fundraising.campaign_email.send",
    entityType: "email_campaigns",
    entityId: campaign.id,
    after: { recipients: recipients.length, sent, failed },
  });
  return NextResponse.json({ ok: true, recipients: recipients.length, sent, failed });
}
