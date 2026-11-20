import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { resolveRecipients } from "@/lib/fundraising/segments";
import { personalize, buildCampaignEmail } from "@/lib/fundraising/comms-email";
import { loadOrgCommsSettings, sendBlocker } from "@/lib/comms/settings";
import { transportFor, TransportError, type Transport } from "@/lib/comms/transport";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const CAP = 2000; // per-send recipient ceiling; the G2 queue replaces this route

// Gmail is paced like the Team Esface engine: 2 at a time with a short gap,
// which stays well under Google's per-account rate limit. Resend takes bigger
// parallel chunks.
const PACE: Record<Transport["kind"], { chunk: number; gapMs: number }> = {
  gmail: { chunk: 2, gapMs: 250 },
  resend: { chunk: 25, gapMs: 0 },
};

// Synchronous until G2 (specs/comms-v2-gmail-amendment.md). At Gmail's pace
// 300 s covers roughly the 400-a-day default cap.
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Send a draft campaign to its segment. Resolves recipients (segment filter +
// has-email − do-not-contact − suppressions), records a per-recipient ledger,
// and flips the campaign to sent. Identity and transport come from
// org_comms_settings. Idempotent guard: only a draft can be sent.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const supabase = createServerSupabase();
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("id, subject, body, segment_id, status")
    .eq("id", params.id)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status !== "draft") return NextResponse.json({ error: "Campaign already sent" }, { status: 409 });
  if (!campaign.segment_id) return NextResponse.json({ error: "Attach a segment first" }, { status: 400 });

  const settings = await loadOrgCommsSettings(supabase, ctx.orgId);
  const blocked = sendBlocker(settings);
  if (blocked || !settings) return NextResponse.json({ error: blocked }, { status: 409 });
  const resolved = await transportFor(settings);
  if ("blocked" in resolved) return NextResponse.json({ error: resolved.blocked }, { status: 409 });
  const transport = resolved.transport;

  const { data: seg } = await supabase.from("segments").select("definition").eq("id", campaign.segment_id).maybeSingle();
  if (!seg) return NextResponse.json({ error: "Segment not found" }, { status: 400 });

  const { recipients, excluded } = await resolveRecipients(supabase, (seg.definition ?? {}) as Record<string, string>);
  if (recipients.length === 0) return NextResponse.json({ error: "Segment has no emailable recipients" }, { status: 400 });
  if (recipients.length > CAP) {
    return NextResponse.json({ error: `Segment resolves to ${recipients.length} recipients (cap ${CAP}). Narrow it first.` }, { status: 400 });
  }

  // Daily cap: what this org has sent in the last 24 hours counts against it.
  // Until the G2 queue can carry the rest over to tomorrow, a campaign that
  // doesn't fit is refused up front rather than half sent.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: sentToday, error: countErr } = await supabase
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .eq("status", "sent")
    .gte("sent_at", since);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  const remaining = Math.max(0, settings.daily_send_cap - (sentToday ?? 0));
  if (recipients.length > remaining) {
    return NextResponse.json(
      {
        error: `This campaign has ${recipients.length} recipients, but only ${remaining} of today's ${settings.daily_send_cap} sends are left. Narrow the segment or send later.`,
      },
      { status: 409 }
    );
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

  const subject = campaign.subject as string;
  const bodyTpl = campaign.body as string;
  const { chunk: CHUNK, gapMs } = PACE[transport.kind];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  // Set when the sender itself stops working (grant revoked, Google limit):
  // nothing after that point is attempted.
  // (Typed through a cast: TypeScript does not track assignments made inside
  // the map callback below, and would otherwise narrow this to null.)
  let stopReason = null as string | null;

  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);

    if (stopReason) {
      skipped += chunk.length;
      await supabase.from("email_sends").upsert(
        chunk.map((r) => ({
          org_id: ctx.orgId,
          campaign_id: campaign.id,
          constituent_id: r.id,
          email: r.email,
          status: "skipped",
          error: `Not sent: ${stopReason}`.slice(0, 500),
          sent_at: null,
        })),
        { onConflict: "campaign_id,email", ignoreDuplicates: true }
      );
      continue;
    }

    const results = await Promise.allSettled(
      chunk.map((r) =>
        transport.send(
          buildCampaignEmail({
            settings,
            to: r.email,
            subject,
            bodyText: personalize(bodyTpl, r.firstName),
            constituentId: r.id,
            campaignId: campaign.id,
          })
        )
      )
    );
    const rows = chunk.map((r, idx) => {
      const base = { org_id: ctx.orgId, campaign_id: campaign.id, constituent_id: r.id, email: r.email };
      const res = results[idx];
      if (res.status === "fulfilled") {
        sent += 1;
        return { ...base, status: "sent", error: null, sent_at: new Date().toISOString() };
      }
      const err: unknown = res.reason;
      if (err instanceof TransportError && (err.failure === "auth" || err.failure === "paused")) {
        stopReason = err.message;
      }
      const maybeSent = err instanceof TransportError && err.failure === "unknown";
      const message = err instanceof Error ? err.message : String(err);
      failed += 1;
      return {
        ...base,
        status: "failed",
        // An 'unknown' status arrives with G2; until then the text says it may have gone.
        error: (maybeSent ? `Unclear, may have been sent: ${message}` : message).slice(0, 500),
        sent_at: null,
      };
    });
    // Ledger rows; ignore dupes if a recipient appears twice in a segment.
    await supabase.from("email_sends").upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true });
    if (gapMs && i + CHUNK < recipients.length) await sleep(gapMs);
  }

  await supabase
    .from("email_campaigns")
    .update({ status: "sent", sent_at: new Date().toISOString(), sent_count: sent, failed_count: failed + skipped })
    .eq("id", campaign.id);

  await audit(req, {
    action: "fundraising.campaign_email.send",
    entityType: "email_campaigns",
    entityId: campaign.id,
    after: {
      recipients: recipients.length,
      sent,
      failed,
      skipped,
      excluded,
      transport: transport.kind,
      from: transport.fromAddress,
      ...(stopReason ? { stopped: stopReason } : {}),
    },
  });
  return NextResponse.json({
    ok: true,
    recipients: recipients.length,
    sent,
    failed,
    skipped,
    excluded,
    ...(stopReason ? { stopped: stopReason } : {}),
  });
}
