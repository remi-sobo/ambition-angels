import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { resolveRecipients, recipientMergeData, previewPool, type RecipientFilter } from "@/lib/fundraising/segments";
import { buildCampaignEmail } from "@/lib/fundraising/comms-email";
import { mergeText, EMPTY_MERGE, type MergeData } from "@/lib/comms/merge";
import { loadOrgCommsSettings, sendBlocker } from "@/lib/comms/settings";
import { transportFor } from "@/lib/comms/transport";
import { campaignStoryBlockForOrg } from "@/lib/comms/story-gate-server";

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

  const supabase = createServerSupabase();
  const { data: c } = await supabase
    .from("email_campaigns")
    .select("subject, body, segment_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A test copy leaves BloomOS too: the consent gate applies (V4 Stage D).
  const storyBlock = await campaignStoryBlockForOrg(ctx.orgId, params.id);
  if (storyBlock) return NextResponse.json({ error: storyBlock }, { status: 409 });

  const settings = await loadOrgCommsSettings(supabase, ctx.orgId);
  const blocked = sendBlocker(settings);
  if (blocked || !settings) return NextResponse.json({ error: blocked }, { status: 409 });
  const resolved = await transportFor(settings);
  if ("blocked" in resolved) return NextResponse.json({ error: resolved.blocked }, { status: 409 });

  // Sample recipient: first resolved recipient of the attached segment,
  // falling back to a generic greeting when there's no segment (or no match).
  // `index` (optional) picks the person the composer is previewing, in the
  // same name order the preview uses.
  let sample: MergeData = { ...EMPTY_MERGE, first_name: "there" };
  const index = Math.max(0, Number(body?.index) || 0);
  const only: RecipientFilter = body?.only === "no_first_name" || body?.only === "never_gave" ? body.only : "all";
  if (c.segment_id) {
    const { data: seg } = await supabase.from("segments").select("definition").eq("org_id", ctx.orgId).eq("id", c.segment_id).maybeSingle();
    if (seg) {
      // A definition the resolver can't apply resolves to nobody, so the
      // generic greeting stands in. The real send refuses it.
      const { recipients } = await resolveRecipients(supabase, seg.definition, ctx.orgId);
      const pool = previewPool(recipients, only);
      const pick = pool[Math.min(index, pool.length - 1)];
      if (pick) sample = recipientMergeData(pick);
    }
  }

  // constituentId stays null: a test copy must never carry a live unsubscribe
  // token for a real donor — one stray click would suppress them.
  const payload = buildCampaignEmail({
    settings,
    to,
    subject: `[TEST] ${mergeText(c.subject as string, sample).text}`,
    bodyText: mergeText(c.body as string, sample).text,
    constituentId: null,
    campaignId: params.id,
  });
  try {
    await resolved.transport.send(payload);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  await audit(req, {
    action: "fundraising.campaign_email.test",
    entityType: "email_campaigns",
    entityId: params.id,
    after: { to, transport: resolved.transport.kind, from: resolved.transport.fromAddress },
  });
  return NextResponse.json({ ok: true });
}
