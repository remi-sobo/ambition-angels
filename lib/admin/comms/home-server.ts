import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getGmailConnectionStatus } from "@/lib/comms/gmail-connection";
import { loadOrgCommsSettings, sendBlocker, type OrgCommsSettings } from "@/lib/comms/settings";
import { loadBankStories, type LoadedStory } from "./bank-server";
import { loadEditions, type EditionWithProgress } from "./editions-server";
import { listKeptStoryDrafts } from "./capture-server";
import type { CommsHomeCounts } from "@/lib/comms/home";

/**
 * Comms Home's reads (V4 Stage D). Called only after the page passed
 * requirePagePermission("comms.manage", { entitlement: "modules.comms" });
 * every read carries `.eq("org_id", orgId)` on the service-role client.
 */

export type HomeCampaign = {
  id: string;
  name: string;
  subject: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  unknown_count: number;
  failed_count: number;
  sent_at: string | null;
  scheduled_at: string | null;
  segment: { name: string } | null;
  opened?: number;
  clicked?: number;
};

export type CommsHome = {
  counts: CommsHomeCounts;
  readyStories: LoadedStory[];
  waitingStories: LoadedStory[];
  editions: EditionWithProgress[];
  scheduled: HomeCampaign[];
  sent: HomeCampaign[];
  unknownCampaignId: string | null;
  sender: {
    settings: OrgCommsSettings | null;
    gmail: Awaited<ReturnType<typeof getGmailConnectionStatus>>;
    usedToday: number;
  };
  sentThisMonth: { campaigns: number; delivered: number };
  readFailed: boolean;
};

const WAITING = new Set(["none", "pending", "expired", "revoked"]);

export async function loadCommsHome(orgId: string, canSeeSubjects: boolean): Promise<CommsHome> {
  const db = getSupabaseAdmin();
  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [bank, editions, campaignsRes, settings, gmail, usedRes, kept] = await Promise.all([
    loadBankStories(db, orgId, canSeeSubjects),
    loadEditions(db, orgId),
    db
      .from("email_campaigns")
      .select("id, name, subject, status, recipient_count, sent_count, unknown_count, failed_count, sent_at, scheduled_at, segment:segments ( name )")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    loadOrgCommsSettings(db, orgId),
    getGmailConnectionStatus(orgId),
    db
      .from("email_sends")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["sent", "sending", "unknown"])
      .gte("sent_at", since24h),
    listKeptStoryDrafts(db, orgId),
  ]);

  const campaigns = (campaignsRes.data ?? []) as unknown as HomeCampaign[];
  const stories = bank.stories;
  const readyStories = stories.filter((s) => s.publishable);
  const waitingStories = stories.filter((s) => s.consent_state !== null && WAITING.has(s.consent_state) && s.status !== "retired");
  const scheduled = campaigns
    .filter((c) => c.status === "scheduled" && c.scheduled_at)
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  const sent = campaigns.filter((c) => c.status === "sent" || c.status === "sending").slice(0, 3);

  // Opens and clicks for the recent sends (G3 columns), counted per campaign.
  if (sent.length > 0) {
    const { data: sendRows } = await db
      .from("email_sends")
      .select("campaign_id, first_opened_at, first_clicked_at")
      .eq("org_id", orgId)
      .in("campaign_id", sent.map((c) => c.id))
      .eq("status", "sent")
      .limit(10000);
    for (const c of sent) {
      const rows = ((sendRows ?? []) as Array<{ campaign_id: string; first_opened_at: string | null; first_clicked_at: string | null }>).filter(
        (r) => r.campaign_id === c.id,
      );
      c.opened = rows.filter((r) => r.first_opened_at).length;
      c.clicked = rows.filter((r) => r.first_clicked_at).length;
    }
  }

  const unknownCampaigns = campaigns.filter((c) => (c.unknown_count ?? 0) > 0);
  const thisMonth = campaigns.filter((c) => c.status === "sent" && c.sent_at && c.sent_at >= monthStart.toISOString());
  const editionsReady = editions.filter(
    (e) => e.status === "compiled" && e.email_campaign_id && (e.campaign_status ?? "draft") === "draft",
  ).length;

  let blocked = sendBlocker(settings);
  if (!blocked && settings?.transport === "gmail" && gmail.state !== "active") {
    blocked = gmail.state === "none" ? "connect your Gmail in Comms Settings." : "your Gmail connection needs to be reconnected in Comms Settings.";
  }

  return {
    counts: {
      unknownSends: unknownCampaigns.reduce((n, c) => n + (c.unknown_count ?? 0), 0),
      unknownCampaigns: unknownCampaigns.length,
      storiesReady: readyStories.length,
      storiesWaitingConsent: waitingStories.length,
      storiesToApprove: stories.filter((s) => s.status === "raw" || s.status === "drafted").length,
      keptDrafts: kept.length,
      editionsReadyToSend: editionsReady,
      scheduled: scheduled.length,
      nextScheduledAt: scheduled[0]?.scheduled_at ?? null,
      senderBlocked: blocked,
    },
    readyStories,
    waitingStories,
    editions,
    scheduled,
    sent,
    unknownCampaignId: unknownCampaigns[0]?.id ?? null,
    sender: { settings, gmail, usedToday: usedRes.count ?? 0 },
    sentThisMonth: { campaigns: thisMonth.length, delivered: thisMonth.reduce((n, c) => n + (c.sent_count ?? 0), 0) },
    readFailed: !!bank.error || !!campaignsRes.error,
  };
}
