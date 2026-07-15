import { createServerSupabase } from "@/lib/supabase/server";
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
  sent_at: string | null;
  segment_id: string | null;
  segment: { name: string } | null;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function CommsPage() {
  const supabase = createServerSupabase();
  const [campaignsRes, segmentsRes, settingsRes] = await Promise.all([
    supabase
      .from("email_campaigns")
      .select("id, name, subject, status, recipient_count, sent_count, failed_count, sent_at, segment_id, segment:segments ( name )")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("segments").select("id, name").order("created_at", { ascending: false }).limit(100),
    supabase
      .from("org_comms_settings")
      .select("from_name, from_email, reply_to, mailing_address, footer_text, daily_send_cap")
      .limit(1)
      .maybeSingle(),
  ]);

  if (campaignsRes.error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className={`${TYPE.pageTitle} mb-4`}>Comms</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
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
        <PageHeader title="Comms" subtitle="Email your donor segments" />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 flex-1 min-w-[18rem]">
            <StatCard label="Campaigns" value={campaigns.length} />
            <StatCard label="Sent" value={sent.length} />
            <StatCard label="Emails delivered" value={totalSent} sub="across all sent campaigns" />
          </div>
          <NewCampaignForm segments={segments} />
        </div>

        <SettingsCard settings={settings} />

        {segments.length === 0 && (
          <div className="bg-[#F4E8D0] text-[#A56A1B] rounded-xl px-5 py-3 text-sm">
            No saved segments yet — build one on the Donors page (Segments &amp; export) to target a campaign.
          </div>
        )}

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          {campaigns.length === 0 ? (
            <p className={`p-8 ${TYPE.bodyMuted}`}>
              No campaigns yet. Create one, attach a saved segment, send a test to yourself, then send.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {campaigns.map((c) => (
                <li key={c.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-1 truncate">{c.name}</div>
                    <div className="text-[11px] text-ink-3 truncate">
                      {c.subject}
                      {c.segment?.name ? ` · ${c.segment.name}` : " · no segment"}
                    </div>
                  </div>
                  {c.status === "sent" ? (
                    <span className="text-[11px] text-ink-2 [font-variant-numeric:tabular-nums] w-40 text-right">
                      {c.sent_count} sent{c.failed_count ? ` · ${c.failed_count} failed` : ""}
                      {c.sent_at ? ` · ${fmtDate(c.sent_at)}` : ""}
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-orange w-40 text-right">{c.status}</span>
                  )}
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
