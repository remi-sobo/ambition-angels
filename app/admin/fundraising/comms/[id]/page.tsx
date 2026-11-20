import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { loadCampaignResults, pct } from "@/lib/comms/results";
import PageHeader from "../../../_components/PageHeader";
import StatCard from "../../../_components/StatCard";
import { SendActions } from "../_components/SendActions";

// One campaign's results (specs/comms-v2-gmail-amendment.md G3): what went
// out, what didn't and why, opens, clicks, unsubscribes, and the sends a
// person needs to decide about.
export const dynamic = "force-dynamic";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

const LEFT_OUT_LABELS: Record<string, string> = {
  doNotContact: "do not contact",
  suppressed: "unsubscribed or bounced",
  noEmail: "no email address",
};

export default async function CampaignResultsPage({ params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  const r = await loadCampaignResults(createServerSupabase(), ctx.orgId, params.id);
  if (!r) notFound();

  const { campaign, counts } = r;
  const delivered = counts.sent;
  const openPct = pct(r.opened, delivered);
  const clickPct = pct(r.clicked, delivered);
  const leftOut = Object.entries(campaign.left_out).filter(([, n]) => n > 0);
  const waiting = counts.pending + counts.sending;

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-[1100px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <Link href="/admin/fundraising/comms" className="text-xs font-semibold text-ink-3 hover:text-ink-1 transition-colors">
          ← All campaigns
        </Link>
        <PageHeader title={campaign.name} subtitle={campaign.subject} />

        <p className="text-sm text-ink-2">
          {campaign.status === "scheduled" && `Scheduled for ${fmt(campaign.scheduled_at)}.`}
          {campaign.status === "sending" && `Sending now. ${waiting} still waiting.`}
          {campaign.status === "sent" && `Finished ${fmt(campaign.finished_at)}.`}
          {campaign.status === "canceled" && `Canceled ${fmt(campaign.finished_at)}.`}
          {campaign.status === "draft" && "Draft. Not sent yet."}
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Sent" value={delivered} sub={`of ${campaign.recipient_count} recipients`} />
          <StatCard label="Opened (about)" value={r.opened} sub={openPct === null ? "" : `${openPct}%`} />
          <StatCard label="Clicked" value={r.clicked} sub={clickPct === null ? "" : `${clickPct}%`} />
          <StatCard label="Unsubscribed" value={r.unsubscribed} />
        </div>

        <section className="bg-tile border-hairline rounded-panel-lg p-5 space-y-2 text-sm text-ink-2">
          <h2 className="text-xs uppercase tracking-wider text-ink-3 font-semibold">What happened</h2>
          <ul className="space-y-1 [font-variant-numeric:tabular-nums]">
            <li>{counts.sent} sent</li>
            {counts.failed > 0 && <li>{counts.failed} not sent (refused by the email service)</li>}
            {counts.unknown > 0 && <li>{counts.unknown} unclear: the email service gave no answer, so they may or may not have arrived</li>}
            {counts.suppressed > 0 && <li>{counts.suppressed} held back: opted out or marked do not contact after queueing</li>}
            {counts.skipped > 0 && <li>{counts.skipped} skipped (canceled, or sending stopped)</li>}
            {waiting > 0 && <li>{waiting} still waiting to send</li>}
            {leftOut.length > 0 && (
              <li>
                Left out before sending:{" "}
                {leftOut.map(([k, n]) => `${n} ${LEFT_OUT_LABELS[k] ?? k}`).join(", ")}
              </li>
            )}
          </ul>
          <p className="text-xs text-ink-3">
            Opens are approximate: some mail apps load images before anyone reads the email.
          </p>
          <a
            href={`/api/admin/comms/${campaign.id}/export`}
            className="inline-block text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors"
          >
            Download CSV
          </a>
        </section>

        {r.links.length > 0 && (
          <section className="bg-tile border-hairline rounded-panel-lg overflow-hidden">
            <h2 className="px-5 pt-4 pb-2 text-xs uppercase tracking-wider text-ink-3 font-semibold">Links clicked</h2>
            <ul className="divide-y divide-hairline">
              {r.links.map((l) => (
                <li key={l.url} className="px-5 py-2.5 flex items-center gap-4 text-sm">
                  <span className="flex-1 min-w-0 truncate text-ink-1">{l.url}</span>
                  <span className="text-xs text-ink-2 [font-variant-numeric:tabular-nums]">
                    {l.people} {l.people === 1 ? "person" : "people"} · {l.clicks} clicks
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.needsAttention.length > 0 && (
          <section className="bg-tile border-hairline rounded-panel-lg overflow-hidden">
            <h2 className="px-5 pt-4 pb-1 text-xs uppercase tracking-wider text-ink-3 font-semibold">Needs a decision</h2>
            <p className="px-5 pb-2 text-xs text-ink-3">
              Unclear sends are never retried on their own, so nobody gets the same email twice. Check, then decide.
            </p>
            <ul className="divide-y divide-hairline">
              {r.needsAttention.map((s) => (
                <li key={s.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-1 truncate">{s.email}</div>
                    <div className="text-xs text-ink-3 truncate">
                      {s.status === "unknown" ? "Unclear" : "Not sent"}
                      {s.error ? ` · ${s.error}` : ""}
                    </div>
                  </div>
                  <SendActions campaignId={campaign.id} sendId={s.id} status={s.status} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
