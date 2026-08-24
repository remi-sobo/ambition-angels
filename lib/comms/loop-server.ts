import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ATTRIBUTION_WINDOW_DAYS,
  attributeGifts,
  type AttributableGift,
  type EditionPerformance,
  type LeadStory,
} from "./loop";
import type { EditionRow } from "./editions-server";
import type { FilledSlot } from "./formats";

/**
 * Server reads for the loop (spec §8 phase 6). Everything goes through the
 * SESSION client. The campaign, its send ledger, and gifts are fundraising-
 * domain rows; a comms caller without fundraising.read simply gets nulls back
 * and the panel says less, which is the same graceful degradation
 * syncSentEditions uses. Nothing here reaches for the service role.
 */

export async function loadEditionPerformance(
  supabase: SupabaseClient,
  orgId: string,
  edition: EditionRow,
  slots: readonly FilledSlot[],
  todayISO: string = new Date().toISOString().slice(0, 10),
): Promise<EditionPerformance | null> {
  if (edition.status !== "sent" || !edition.email_campaign_id || !edition.sent_at) return null;

  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("id, sent_count, failed_count, sent_at")
    .eq("id", edition.email_campaign_id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!campaign) return null; // RLS or a deleted campaign: no numbers beats wrong numbers.

  const row = campaign as { sent_count: number; failed_count: number };
  const sentOn = edition.sent_at.slice(0, 10);

  // Who received it, and who among them gave inside the window. Both reads are
  // org-pinned; the recipient set is capped by the sender itself (2000/send).
  const windowEnd = new Date(`${sentOn}T00:00:00Z`);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + ATTRIBUTION_WINDOW_DAYS);
  const windowEndISO = windowEnd.toISOString().slice(0, 10);

  const [{ data: sends }, { data: gifts }] = await Promise.all([
    supabase
      .from("email_sends")
      .select("constituent_id")
      .eq("org_id", orgId)
      .eq("campaign_id", edition.email_campaign_id)
      .eq("status", "sent")
      .not("constituent_id", "is", null)
      .limit(5000),
    supabase
      .from("gifts")
      .select("constituent_id, amount, gift_date")
      .eq("org_id", orgId)
      .gte("gift_date", sentOn)
      .lte("gift_date", windowEndISO)
      .not("constituent_id", "is", null)
      .limit(5000),
  ]);

  // sends === null means RLS said no. The panel then shows the send counts the
  // campaign row already gave us and stays silent about money.
  const recipients =
    sends === null
      ? null
      : new Set(
          (sends as Array<{ constituent_id: string | null }>)
            .map((r) => r.constituent_id)
            .filter((v): v is string => !!v),
        );

  const attribution =
    recipients === null || gifts === null
      ? null
      : attributeGifts(
          (gifts as AttributableGift[]) ?? [],
          recipients,
          edition.sent_at,
        );

  const storyIds = slots
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => s.story_id)
    .filter((v): v is string => !!v);
  let storyTitles: string[] = [];
  if (storyIds.length > 0) {
    const { data: stories } = await supabase
      .from("stories")
      .select("id, title")
      .eq("org_id", orgId)
      .in("id", storyIds);
    const titleById = new Map(
      ((stories ?? []) as Array<{ id: string; title: string }>).map((s) => [s.id, s.title]),
    );
    storyTitles = storyIds.map((id) => titleById.get(id)).filter((v): v is string => !!v);
  }

  return {
    sent: row.sent_count ?? 0,
    failed: row.failed_count ?? 0,
    gifts: attribution,
    storyTitles,
    windowOpen: todayISO <= windowEndISO,
  };
}

/**
 * The most recent sent edition's lead story: the first slot in format order
 * holding one. Feeds the bank's verdict line; null when no edition has gone
 * out yet, which is most tenants most of the time.
 */
export async function loadLastLead(
  supabase: SupabaseClient,
  orgId: string,
): Promise<LeadStory | null> {
  const { data: ed } = await supabase
    .from("comms_editions")
    .select("id")
    .eq("org_id", orgId)
    .eq("status", "sent")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ed) return null;

  const { data: slots } = await supabase
    .from("comms_edition_slots")
    .select("story_id, position")
    .eq("org_id", orgId)
    .eq("edition_id", (ed as { id: string }).id)
    .not("story_id", "is", null)
    .order("position", { ascending: true })
    .limit(1);
  const lead = (slots ?? [])[0] as { story_id: string } | undefined;
  if (!lead?.story_id) return null;

  const { data: story } = await supabase
    .from("stories")
    .select("title, tags")
    .eq("id", lead.story_id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!story) return null;
  const s = story as { title: string; tags: string[] | null };
  return { title: s.title, tags: s.tags ?? [] };
}
