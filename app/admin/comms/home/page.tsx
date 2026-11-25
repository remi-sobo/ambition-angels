import Link from "next/link";
import PageShell, { PageSection } from "../../_components/ui/PageShell";
import PageHeader from "../../_components/PageHeader";
import Figure, { SummaryStrip } from "../../_components/ui/Figure";
import Card, { CardHeader } from "../../_components/ui/Card";
import ListRow, { ListRows } from "../../_components/ui/ListRow";
import Badge from "../../_components/ui/Badge";
import { ButtonLink } from "../../_components/ui/Button";
import Notice from "../../_components/ui/Notice";
import EmptyState from "../../_components/EmptyState";
import { requirePagePermission } from "../../_components/PermissionGate";
import { ctxHasPermission } from "@/lib/admin/auth";
import { loadCommsHome } from "@/lib/admin/comms/home-server";
import { commsDecisionLine, commsNeedsYou } from "@/lib/comms/home";
import { TYPE } from "@/lib/admin/typeScale";
import StoryChip from "../_components/StoryChips";

/**
 * Comms Home (V4 Stage D; Dashboard archetype per Comms.dc.html): header with
 * the sending identity, one decision line, a summary strip that follows the
 * flow (stories → editions → scheduled → sent), a Needs-you list, the stories
 * ready to use and the one waiting on consent, then sending and results.
 */
export const dynamic = "force-dynamic";

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "");

export default async function CommsHomePage() {
  const gate = await requirePagePermission("comms.manage", "Comms", { entitlement: "modules.comms" });
  if (!gate.ok) return gate.page;
  const ctx = gate.ctx;
  const canSee = await ctxHasPermission(ctx, "comms.subjects.read");
  const home = await loadCommsHome(ctx.orgId, canSee);
  const c = home.counts;
  const line = commsDecisionLine(c);
  const needs = commsNeedsYou(c, { unknownHref: home.unknownCampaignId ? `/admin/comms/emails/${home.unknownCampaignId}` : null });

  const s = home.sender.settings;
  const account = home.sender.gmail.state !== "none" ? home.sender.gmail.accountEmail : null;
  const from = s?.transport === "gmail" ? account : s?.from_email || null;
  const senderLine = from
    ? `Sending from ${from}${s?.transport === "gmail" ? " through your Gmail" : ""} · ${(s?.daily_send_cap ?? 0).toLocaleString("en-US")} a day limit, ${home.sender.usedToday.toLocaleString("en-US")} used today`
    : "No sender connected yet. Connect Gmail in Settings.";
  const inProgress = home.editions.filter((e) => e.status !== "sent" && e.status !== "archived");
  const firstEdition = inProgress[0] ?? null;

  return (
    <PageShell>
      <PageHeader
        title="Comms"
        subtitle={senderLine}
        secondaryActions={<ButtonLink href="/admin/comms/emails" variant="secondary">New email</ButtonLink>}
        primaryAction={<ButtonLink href="/admin/comms/stories/new" variant="primary">Add a story</ButtonLink>}
      />
      <p className={`${TYPE.body} -mt-2 mb-4 max-w-[70ch]`} data-testid="comms-decision">{line}</p>

      {home.readFailed && (
        <Notice tone="partial" title="Some of Comms couldn't be read just now." className="mb-4">
          Counts below may be missing items. Reload to try again.
        </Notice>
      )}

      <SummaryStrip label="Comms, from story to send">
        <Figure layout="strip" label="1 · Stories ready to use" value={c.storiesReady} source="Approved, consent checked, as of now" href="/admin/comms/stories?ready=1" />
        <Figure
          layout="strip"
          label="2 · Editions in progress"
          value={inProgress.length}
          source={firstEdition ? `${firstEdition.title}, ${firstEdition.completeness.label}` : "None started"}
          href="/admin/comms/editions"
        />
        <Figure
          layout="strip"
          label="3 · Scheduled sends"
          value={c.scheduled}
          source={c.nextScheduledAt ? `Next goes ${fmtWhen(c.nextScheduledAt)}` : "Nothing scheduled"}
          href="/admin/comms/emails"
        />
        <Figure
          layout="strip"
          label="4 · Sent this month"
          value={home.sentThisMonth.campaigns}
          source={`${home.sentThisMonth.delivered.toLocaleString("en-US")} emails delivered this month`}
          href="/admin/comms/emails"
        />
      </SummaryStrip>

      {needs.length > 0 && (
        <PageSection title="Needs you">
          <Card padded={false}>
            <ListRows>
              {needs.map((n) => (
                <ListRow
                  key={n.key}
                  title={n.title}
                  meta={n.why}
                  leading={<Badge tone={n.tone === "neutral" ? "neutral" : n.tone}>{n.tone === "danger" ? "Decide" : n.tone === "warning" ? "Waiting" : "To do"}</Badge>}
                  actions={<ButtonLink href={n.href} variant="secondary" size="sm">{n.action}</ButtonLink>}
                />
              ))}
            </ListRows>
          </Card>
        </PageSection>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card>
          <CardHeader
            title="Ready to use"
            hint={`${c.storiesReady} ${c.storiesReady === 1 ? "story" : "stories"} with consent checked, as of now`}
            action={<Link href="/admin/comms/stories" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-orange">All stories</Link>}
          />
          {home.readyStories.length === 0 ? (
            <EmptyState label="stories ready to use" hint="A story is ready once someone approves it and everyone in it has consent on file." />
          ) : (
            <ul className="divide-y divide-hairline">
              {home.readyStories.slice(0, 3).map((st) => (
                <li key={st.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/comms/stories/${st.id}`} className={`${TYPE.cardTitle} hover:text-orange`}>{st.title}</Link>
                    <StoryChip status={st.status} consent_state={st.consent_state} publishable={st.publishable} />
                  </div>
                  {st.body && <p className={`${TYPE.bodyMuted} mt-1 line-clamp-2`}>{st.body}</p>}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className={TYPE.metadata}>{st.captured_by ? `Captured by ${st.captured_by} · ` : ""}{fmtDay(st.created_at)}</span>
                    <Link href={`/admin/comms/editions?story=${st.id}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-orange">Use in an edition</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {home.waitingStories.length > 0 && (
            <div className="mt-3 border-t border-hairline pt-3">
              <p className={`${TYPE.cardLabel} mb-2`}>Waiting on consent ({home.waitingStories.length})</p>
              {home.waitingStories.slice(0, 1).map((st) => (
                <div key={st.id}>
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/comms/stories/${st.id}`} className={`${TYPE.cardTitle} hover:text-orange`}>{st.title}</Link>
                    <StoryChip status={st.status} consent_state={st.consent_state} publishable={st.publishable} />
                  </div>
                  <p className={`${TYPE.metadata} mt-1`}>{st.blocked_reason}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Sending and results"
            hint="Every send and open also shows on each donor's record"
            action={<Link href="/admin/comms/emails" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-orange">All emails</Link>}
          />
          {home.scheduled.length === 0 && home.sent.length === 0 ? (
            <EmptyState label="emails yet" hint="Compile an edition or write an email, choose who it goes to, send yourself a test, then send." />
          ) : (
            <ul className="divide-y divide-hairline">
              {home.scheduled.slice(0, 1).map((e) => (
                <li key={e.id} className="py-3">
                  <p className={TYPE.metadata}>Scheduled · {e.scheduled_at ? fmtWhen(e.scheduled_at) : ""}</p>
                  <p className={TYPE.cardTitle}>{e.name}</p>
                  <p className={`${TYPE.bodyMuted} mt-0.5`}>
                    To {e.segment?.name ?? "a list"} · {e.recipient_count.toLocaleString("en-US")} people
                  </p>
                </li>
              ))}
              {home.sent.map((e) => (
                <li key={e.id} className="py-3">
                  <p className={TYPE.metadata}>
                    {e.status === "sending" ? "Sending" : `Sent ${e.sent_at ? fmtDay(e.sent_at) : ""}`} · {e.recipient_count.toLocaleString("en-US")} people
                  </p>
                  <Link href={`/admin/comms/emails/${e.id}`} className={`${TYPE.cardTitle} hover:text-orange`}>{e.name}</Link>
                  <dl className="mt-2 grid grid-cols-3 gap-2">
                    <div><dt className={TYPE.metadata}>Delivered</dt><dd className="font-semibold tabular-nums">{e.sent_count.toLocaleString("en-US")}</dd><dd className="text-[11px] text-ink-2">Accepted by Gmail</dd></div>
                    <div><dt className={TYPE.metadata}>Opened</dt><dd className="font-semibold tabular-nums">{(e.opened ?? 0).toLocaleString("en-US")} <span className="text-ink-2 font-normal">{pct(e.opened ?? 0, e.sent_count)}</span></dd><dd className="text-[11px] text-ink-2">Opens are estimates</dd></div>
                    <div><dt className={TYPE.metadata}>Clicked</dt><dd className="font-semibold tabular-nums">{(e.clicked ?? 0).toLocaleString("en-US")}</dd><dd className="text-[11px] text-ink-2">From tracked links</dd></div>
                  </dl>
                  {e.unknown_count > 0 && <p className="mt-1 text-xs text-expense">{e.unknown_count} sends unclear, see Needs you above</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
