import type { createServerSupabase } from "@/lib/supabase/server";
import { resolveRecipients, recipientMergeData, type ResolvedRecipients } from "@/lib/fundraising/segments";
import { checkMerge } from "./merge";
import { loadOrgCommsSettings, sendBlocker } from "./settings";
import { transportFor } from "./transport";
import { MAX_RECIPIENTS, spreadMessage } from "./queue-plan";
import { newTrackingToken } from "./links";
import { campaignStoryBlockForOrg } from "./story-gate-server";

/**
 * Enqueue and cancel (specs/comms-v2-gmail-amendment.md G2), on the caller's
 * session client so RLS and the org pin both apply. The worker
 * (lib/comms/worker.ts) does the sending.
 */

export type StartResult =
  | { ok: true; queued: number; scheduledAt: string | null; excluded: Record<string, number>; note: string | null }
  | { ok: false; status: number; error: string };

const INSERT_CHUNK = 500;

type SupabaseClient = ReturnType<typeof createServerSupabase>;

export async function startCampaign(
  supabase: SupabaseClient,
  orgId: string,
  campaignId: string,
  scheduledAt: Date | null
): Promise<StartResult> {
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("id, segment_id, status, subject, body")
    .eq("org_id", orgId)
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, status: 404, error: "Not found" };
  if (campaign.status !== "draft") return { ok: false, status: 409, error: "Only a draft can be sent or scheduled." };
  if (!campaign.segment_id) return { ok: false, status: 400, error: "Choose a list first." };

  // V4 Stage D: an edition's email carries story text frozen at compile. A
  // consent revoked or expired since then stops it here (and again per copy
  // in the worker).
  const storyBlock = await campaignStoryBlockForOrg(orgId, campaignId);
  if (storyBlock) return { ok: false, status: 409, error: storyBlock };

  const settings = await loadOrgCommsSettings(supabase, orgId);
  const blocked = sendBlocker(settings);
  if (blocked || !settings) return { ok: false, status: 409, error: blocked ?? "Comms settings are missing." };
  // Checked now even for a scheduled send, so a broken sender shows up today
  // rather than at 6 am on send day.
  const resolved = await transportFor(settings);
  if ("blocked" in resolved) return { ok: false, status: 409, error: resolved.blocked };

  const seg = await resolveCampaignSegment(supabase, orgId, campaign.segment_id);
  if (!seg.ok) return seg;
  const { recipients, excluded } = seg;
  if (recipients.length === 0) return { ok: false, status: 400, error: "No one on this list can be emailed." };
  if (recipients.length > MAX_RECIPIENTS) {
    return {
      ok: false,
      status: 400,
      error: `This list has ${recipients.length} people. One email can go to ${MAX_RECIPIENTS} at most. Narrow it first.`,
    };
  }

  // Merge fields are checked against everyone who would get it. A typo or a
  // field someone has no value for refuses the whole send, here, before
  // anything is queued.
  const merge = checkMerge(String(campaign.subject ?? ""), String(campaign.body ?? ""), recipients.map(recipientMergeData));
  if (merge.blockers.length) return { ok: false, status: 400, error: `Nothing was sent. ${merge.blockers[0]}` };

  // Claim the draft first so a double-submit can't queue twice.
  const { data: claimed } = await supabase
    .from("email_campaigns")
    .update({
      status: scheduledAt ? "scheduled" : "sending",
      scheduled_at: scheduledAt?.toISOString() ?? null,
      started_at: scheduledAt ? null : new Date().toISOString(),
      recipient_count: recipients.length,
      left_out: excluded,
    })
    .eq("org_id", orgId)
    .eq("id", campaignId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, status: 409, error: "Campaign is already sending or scheduled." };

  const rows = recipients.map((r) => ({
    org_id: orgId,
    campaign_id: campaignId,
    constituent_id: r.id,
    email: r.email,
    first_name: r.firstName || null,
    status: "pending",
    tracking_token: newTrackingToken(),
  }));
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await supabase
      .from("email_sends")
      .upsert(rows.slice(i, i + INSERT_CHUNK), { onConflict: "campaign_id,email", ignoreDuplicates: true });
    if (error) {
      // Put the campaign back to a draft and clear what was queued, so
      // nothing goes out half-queued.
      await supabase.from("email_sends").delete().eq("org_id", orgId).eq("campaign_id", campaignId).eq("status", "pending");
      await supabase
        .from("email_campaigns")
        .update({ status: "draft", scheduled_at: null, started_at: null })
        .eq("org_id", orgId)
        .eq("id", campaignId);
      console.error("[comms] enqueue failed:", error.message);
      return { ok: false, status: 500, error: "Couldn't queue the campaign. Nothing was sent. Try again." };
    }
  }

  const note = await capNote(supabase, orgId, recipients.length, settings.daily_send_cap, !!scheduledAt);
  return { ok: true, queued: recipients.length, scheduledAt: scheduledAt?.toISOString() ?? null, excluded, note };
}

/** Load a campaign's segment and resolve it (org-pinned). A definition the
 *  resolver can't apply is a refusal, never a wider send. */
async function resolveCampaignSegment(
  supabase: SupabaseClient,
  orgId: string,
  segmentId: string
): Promise<({ ok: true } & ResolvedRecipients) | { ok: false; status: number; error: string }> {
  const { data: seg } = await supabase
    .from("segments")
    .select("definition")
    .eq("org_id", orgId)
    .eq("id", segmentId)
    .maybeSingle();
  if (!seg) return { ok: false, status: 400, error: "That list wasn't found." };
  const resolved = await resolveRecipients(supabase, seg.definition, orgId);
  if (resolved.error) return { ok: false, status: 400, error: resolved.error };
  return { ok: true, ...resolved };
}

export type PreviewResult =
  | { ok: true; recipients: number; excluded: ResolvedRecipients["excluded"]; maxRecipients: number }
  | { ok: false; status: number; error: string };

/** The recipient-count preview the send and schedule confirm shows: the same
 *  resolution startCampaign queues, without queuing anything. */
export async function previewCampaign(
  supabase: SupabaseClient,
  orgId: string,
  campaignId: string
): Promise<PreviewResult> {
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("id, segment_id")
    .eq("org_id", orgId)
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, status: 404, error: "Not found" };
  if (!campaign.segment_id) return { ok: false, status: 400, error: "Choose a list first." };
  const storyBlock = await campaignStoryBlockForOrg(orgId, campaignId);
  if (storyBlock) return { ok: false, status: 409, error: storyBlock };
  const seg = await resolveCampaignSegment(supabase, orgId, campaign.segment_id);
  if (!seg.ok) return seg;
  return { ok: true, recipients: seg.recipients.length, excluded: seg.excluded, maxRecipients: MAX_RECIPIENTS };
}

async function capNote(
  supabase: SupabaseClient,
  orgId: string,
  total: number,
  dailyCap: number,
  scheduled: boolean
): Promise<string | null> {
  // For a scheduled send, today's usage says little about send day.
  if (scheduled) return total > dailyCap ? spreadMessage(total, dailyCap, dailyCap) : null;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabase
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("status", ["sent", "sending", "unknown"])
    .or(`sent_at.gte.${since},claimed_at.gte.${since}`);
  return spreadMessage(total, Math.max(0, dailyCap - (count ?? 0)), dailyCap);
}

/** Cancel a scheduled or sending campaign. Rows already in a worker's hands
 *  finish; everything still pending is marked skipped. */
export async function cancelCampaign(
  supabase: SupabaseClient,
  orgId: string,
  campaignId: string
): Promise<{ ok: true; skipped: number } | { ok: false; status: number; error: string }> {
  const { data: claimed } = await supabase
    .from("email_campaigns")
    .update({ status: "canceled", finished_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", campaignId)
    .in("status", ["scheduled", "sending"])
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, status: 409, error: "Only a scheduled or sending campaign can be canceled." };

  const { data, error } = await supabase
    .from("email_sends")
    .update({ status: "skipped", error: "Canceled before it was sent." })
    .eq("org_id", orgId)
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, skipped: data?.length ?? 0 };
}
