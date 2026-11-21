import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import EmptyState from "../../_components/EmptyState";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { getGmailConnectionStatus } from "@/lib/comms/gmail-connection";
import { GmailCard, type GmailNotice } from "./_components/GmailCard";
import PageHeader from "../../_components/PageHeader";
import StatCard from "../../_components/StatCard";
import { NewCampaignForm, CampaignActions } from "./_components/CommsControls";
import { SettingsCard, type CommsSettings } from "./_components/SettingsCard";
import { TYPE } from "@/lib/admin/typeScale";

// Epic I — donor communications: compose campaigns against saved segments,
// test, and send (DNC/unsubscribe honored by the send path).
export const dynamic = "force-dynamic";

type Campaign = {
  id: string;
  name: string;
  subject: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  unknown_count: number;
  sent_at: string | null;
  scheduled_at: string | null;
  segment_id: string | null;
  segment: { name: string } | null;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// One line per campaign: where it is in the queue, in plain numbers.
// Counts are refreshed by the worker every minute while it sends.
function CampaignStatus({ c }: { c: Campaign }) {
  const extras = [
    c.failed_count ? `${c.failed_count} not sent` : "",
    c.unknown_count ? `${c.unknown_count} unclear` : "",
  ].filter(Boolean);
  const tail = extras.length ? ` · ${extras.join(" · ")}` : "";
  const cls = "text-xs text-ink-2 [font-variant-numeric:tabular-nums] w-56 text-right";
  if (c.status === "sent") {
    return <span className={cls}>{c.sent_count} sent{tail}{c.sent_at ? ` · ${fmtDate(c.sent_at)}` : ""}</span>;
  }
  if (c.status === "sending") {
    return <span className={cls}>Sending: {c.sent_count} of {c.recipient_count}{tail}</span>;
  }
  if (c.status === "scheduled" && c.scheduled_at) {
    return <span className={cls}>Scheduled for {fmtDateTime(c.scheduled_at)} · {c.recipient_count} people</span>;
  }
  if (c.status === "canceled") {
    return <span className={cls}>Canceled · {c.sent_count} sent before{tail}</span>;
  }
  return <span className="text-xs uppercase tracking-wider text-orange w-56 text-right">{c.status}</span>;
}

function gmailNotice(params: Record<string, string | string[] | undefined>): GmailNotice {
  const kind = params.gmail;
  const reason = typeof params.reason === "string" ? params.reason.slice(0, 300) : undefined;
  if (kind === "connected" || kind === "cancelled") return { kind };
  if (kind === "error") return { kind, reason };
  return null;
}

export default async function CommsPage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // Every read is pinned to the ACTIVE org — RLS alone would merge rows from
  // every org the user belongs to.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Emails" subtitle="Sign in to view emails." />
      </div>
    );
  }
  const supabase = createServerSupabase();
  const [campaignsRes, segmentsRes, settingsRes, gmailStatus, canManage] = await Promise.all([
    supabase
      .from("email_campaigns")
      .select("id, name, subject, status, recipient_count, sent_count, failed_count, unknown_count, sent_at, scheduled_at, segment_id, segment:segments ( name )")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("segments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(100),
    supabase
      .from("org_comms_settings")
      .select("from_name, from_email, reply_to, mailing_address, footer_text, daily_send_cap, transport, leadership_copy_emails")
      .eq("org_id", ctx.orgId)
      .limit(1)
      .maybeSingle(),
    getGmailConnectionStatus(ctx.orgId),
    ctxHasPermission(ctx, "org.manage"),
  ]);

  if (campaignsRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className={`${TYPE.pageTitle} mb-4`}>Emails</h1>
        <div className="bg-tile border border-orange/30 rounded-panel-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The comms tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_email_campaigns.sql</code>, then reload.
        </div>
      </div>
    );
  }

  const campaigns = (campaignsRes.data ?? []) as unknown as Campaign[];
  const segments = (segmentsRes.data ?? []) as Array<{ id: string; name: string }>;
  const settings = (settingsRes.data ?? null) as CommsSettings | null;
  const sent = campaigns.filter((c) => c.status === "sent");
  const totalSent = sent.reduce((s, c) => s + c.sent_count, 0);

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader title="Emails" subtitle="Email your donor segments" />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 flex-1 min-w-[18rem]">
            <StatCard label="Campaigns" value={campaigns.length} />
            <StatCard label="Sent" value={sent.length} />
            <StatCard label="Emails delivered" value={totalSent} sub="across all sent campaigns" />
          </div>
          <NewCampaignForm segments={segments} />
        </div>

        <GmailCard
          status={gmailStatus}
          transport={settings?.transport ?? null}
          canManage={canManage}
          notice={gmailNotice(searchParams)}
        />

        <SettingsCard
          settings={settings}
          gmailAccount={settings?.transport === "gmail" && gmailStatus.state !== "none" ? gmailStatus.accountEmail : null}
        />

        {segments.length === 0 && (
          <div className="bg-status-watch-bg text-status-watch-text rounded-panel px-5 py-3 text-sm">
            No saved segments yet. Build one on the Donors page (Segments &amp; export) to target a campaign.
          </div>
        )}

        <section className="bg-tile border-hairline rounded-panel-lg overflow-hidden">
          {campaigns.length === 0 ? (
            <div className="p-4">
              <EmptyState
                label="campaigns"
                hint="Create one with the button above, attach a saved segment, send a test to yourself, then send."
              />
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {campaigns.map((c) => (
                <li key={c.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    {c.status === "draft" ? (
                      <div className="text-sm font-medium text-ink-1 truncate">{c.name}</div>
                    ) : (
                      <Link href={`/admin/comms/emails/${c.id}`} className="block text-sm font-medium text-ink-1 truncate hover:text-orange transition-colors">
                        {c.name}
                      </Link>
                    )}
                    <div className="text-xs text-ink-3 truncate">
                      {c.subject}
                      {c.segment?.name ? ` · ${c.segment.name}` : " · no segment"}
                    </div>
                  </div>
                  <CampaignStatus c={c} />
                  <CampaignActions id={c.id} status={c.status} hasSegment={!!c.segment_id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
