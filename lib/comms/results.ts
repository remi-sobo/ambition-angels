import type { createServerSupabase } from "@/lib/supabase/server";

/**
 * One campaign's results (specs/comms-v2-gmail-amendment.md G3), read on the
 * session client and pinned to the org. Campaigns are capped at 5,000
 * recipients, so the sends are read whole (in pages) and counted here.
 */

type Supabase = ReturnType<typeof createServerSupabase>;

export type SendRow = {
  id: string;
  email: string;
  first_name: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  open_count: number;
  click_count: number;
};

export type CampaignResults = {
  campaign: {
    id: string;
    name: string;
    subject: string;
    status: string;
    recipient_count: number;
    scheduled_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    left_out: Record<string, number>;
  };
  counts: Record<"sent" | "pending" | "sending" | "failed" | "unknown" | "skipped" | "suppressed", number>;
  opened: number;
  clicked: number;
  unsubscribed: number;
  links: Array<{ url: string; clicks: number; people: number }>;
  needsAttention: SendRow[];
};

const STATUSES = ["sent", "pending", "sending", "failed", "unknown", "skipped", "suppressed"] as const;

export async function loadCampaignResults(
  supabase: Supabase,
  orgId: string,
  campaignId: string
): Promise<CampaignResults | null> {
  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("id, name, subject, status, recipient_count, scheduled_at, started_at, finished_at, left_out")
    .eq("org_id", orgId)
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return null;

  // PostgREST returns at most 1,000 rows a request, so the sends are paged.
  const readSends = async (): Promise<{ data: SendRow[]; error: { message: string } | null }> => {
    const all: SendRow[] = [];
    for (let from = 0; from < 10_000; from += 1000) {
      const { data, error } = await supabase
        .from("email_sends")
        .select("id, email, first_name, status, error, sent_at, open_count, click_count")
        .eq("org_id", orgId)
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) return { data: [], error };
      const page = (data ?? []) as SendRow[];
      all.push(...page);
      if (page.length < 1000) break;
    }
    return { data: all, error: null };
  };
  const [sendsRes, unsubRes, clicksRes] = await Promise.all([
    readSends(),
    supabase
      .from("email_suppressions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("source_campaign_id", campaignId),
    supabase
      .from("email_link_clicks")
      .select("url, send_id")
      .eq("org_id", orgId)
      .eq("campaign_id", campaignId)
      .limit(20000),
  ]);
  if (sendsRes.error) throw new Error(sendsRes.error.message);

  const sends = (sendsRes.data ?? []) as SendRow[];
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as CampaignResults["counts"];
  for (const r of sends) if (r.status in counts) counts[r.status as keyof typeof counts] += 1;

  const byUrl = new Map<string, { clicks: number; people: Set<string> }>();
  for (const c of (clicksRes.data ?? []) as Array<{ url: string; send_id: string }>) {
    const cur = byUrl.get(c.url) ?? { clicks: 0, people: new Set<string>() };
    cur.clicks += 1;
    cur.people.add(c.send_id);
    byUrl.set(c.url, cur);
  }

  return {
    campaign: {
      ...(campaign as Omit<CampaignResults["campaign"], "left_out">),
      left_out: ((campaign.left_out ?? {}) as Record<string, number>) || {},
    },
    counts,
    opened: sends.filter((r) => r.open_count > 0).length,
    clicked: sends.filter((r) => r.click_count > 0).length,
    unsubscribed: unsubRes.count ?? 0,
    links: Array.from(byUrl.entries())
      .map(([url, v]) => ({ url, clicks: v.clicks, people: v.people.size }))
      .sort((a, b) => b.people - a.people),
    // What a person should look at: unclear sends first, then failures.
    needsAttention: [
      ...sends.filter((r) => r.status === "unknown"),
      ...sends.filter((r) => r.status === "failed"),
    ].slice(0, 200),
  };
}

/** Percent of `part` in `whole`, rounded, or null when whole is 0. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

const CSV_COLUMNS = ["email", "first_name", "status", "sent_at", "opens", "clicks", "error"] as const;

/** RFC 4180 CSV of a campaign's sends. Cells that start with a formula
 *  character are prefixed so a spreadsheet won't run them. */
export function sendsCsv(rows: SendRow[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [r.email, r.first_name, r.status, r.sent_at, r.open_count, r.click_count, r.error].map(cell).join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}
