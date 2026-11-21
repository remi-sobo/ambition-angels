/**
 * Comms results on the donor record (V4 Stage D, spec §9 "sends and opens
 * appear on the donor timeline"). PURE: the donor page reads email_sends for
 * one constituent and this decides what each row says.
 *
 * What the Gmail sender records (comms G2 and G3) and what is shown:
 *   status 'sent'     an "Email sent" entry at sent_at, with the campaign's
 *                     subject; an "Opened" chip from first_opened_at (opens
 *                     are estimates: image blocking hides some, privacy
 *                     proxies fake some) and a "Clicked" chip from
 *                     first_clicked_at.
 *   status 'unknown'  "Email may not have gone out": Gmail did not answer and
 *                     nobody resends on their own.
 * Pending, failed, skipped and suppressed rows never reached the donor, so
 * they are not on the record.
 */

export type DonorSendRow = {
  id: string;
  status: string;
  sent_at: string | null;
  claimed_at?: string | null;
  created_at?: string | null;
  first_opened_at: string | null;
  open_count: number | null;
  first_clicked_at: string | null;
  click_count: number | null;
  campaign_id: string;
  campaign: { name: string | null; subject: string | null } | null;
};

export type EmailTimelineItem = {
  id: string;
  /** ISO timestamp the entry sorts by. */
  at: string;
  title: string;
  /** Short chips, in order. */
  chips: string[];
  meta: string;
  campaignId: string;
  status: "sent" | "unknown";
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

export function emailTimelineItems(rows: readonly DonorSendRow[]): EmailTimelineItem[] {
  const out: EmailTimelineItem[] = [];
  for (const r of rows) {
    const subject = (r.campaign?.subject ?? "").trim() || (r.campaign?.name ?? "").trim() || "an email";
    if (r.status === "sent" && r.sent_at) {
      const chips: string[] = [];
      if (r.first_opened_at) chips.push(`Opened ${shortDate(r.first_opened_at)}`);
      if (r.first_clicked_at) chips.push("Clicked a link");
      out.push({
        id: `es-${r.id}`,
        at: r.sent_at,
        title: `Email sent: ${subject}`,
        chips,
        meta: r.first_opened_at
          ? "From your connected Gmail. Opens are estimates."
          : "From your connected Gmail. Not opened yet, as far as we can tell.",
        campaignId: r.campaign_id,
        status: "sent",
      });
    } else if (r.status === "unknown") {
      const at = r.claimed_at ?? r.created_at ?? null;
      if (!at) continue;
      out.push({
        id: `es-${r.id}`,
        at,
        title: `Email may not have gone out: ${subject}`,
        chips: ["Unclear"],
        meta: "Gmail did not answer. It is never resent on its own.",
        campaignId: r.campaign_id,
        status: "unknown",
      });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
