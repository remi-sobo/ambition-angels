import Link from "next/link";
import { notFound } from "next/navigation";
import { getUpcomingMeetingDetail, type UpcomingMeetingDetail } from "@/lib/meetings/read";
import type { ConstituentDossier, PartnerDossier } from "@/lib/meetings/dossier";
import { SectionTitle } from "../../_ui";
import MeetingAgendaButton from "../../_components/MeetingAgendaButton";

export const dynamic = "force-dynamic";

const ORG_TZ = "America/Los_Angeles";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: ORG_TZ,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function fmtDay(s: string | null): string {
  if (!s) return "—";
  return new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtRelDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: ORG_TZ, month: "short", day: "numeric", year: "numeric" });
}
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-[15px] text-ink-1 font-semibold truncate [font-variant-numeric:tabular-nums]">{value}</div>
    </div>
  );
}

function FirstMeetingBadge({ first, prior }: { first: boolean; prior: number }) {
  return first ? (
    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold bg-orange-light text-orange-dark border border-orange/30">
      First meeting
    </span>
  ) : (
    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold bg-status-neutral-bg text-ink-2 border border-outline">
      {prior} prior {prior === 1 ? "touch" : "touches"}
    </span>
  );
}

function ConstituentCard({ d, first, prior }: { d: ConstituentDossier; first: boolean; prior: number }) {
  const lastInt = d.recent_interactions[0];
  return (
    <div className="rounded-card border border-outline bg-tile/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/admin/fundraising/donors/${d.id}`} className="text-[15px] font-medium text-ink-1 hover:text-orange transition-colors">
          {d.profile.name}
        </Link>
        <FirstMeetingBadge first={first} prior={prior} />
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Lifetime" value={usd(d.giving.lifetime_total)} />
        <Stat label="Gifts" value={String(d.giving.gift_count)} />
        <Stat label="Last gift" value={fmtDay(d.giving.last_gift_date)} />
        <Stat label="Largest" value={usd(d.giving.largest_gift)} />
      </div>
      {(d.profile.tags.length > 0 || d.profile.do_not_contact) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {d.profile.do_not_contact && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-status-watch-bg text-ink-1 border border-status-watch/40">Do not contact</span>
          )}
          {d.profile.tags.map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-hairline text-ink-2">{t}</span>
          ))}
        </div>
      )}
      {d.open_opportunities.length > 0 && (
        <p className="mt-3 text-[13px] text-ink-2">
          <span className="text-ink-3">Open ask:</span>{" "}
          {d.open_opportunities[0].name ?? "Opportunity"}
          {d.open_opportunities[0].ask_amount != null && <> · {usd(d.open_opportunities[0].ask_amount)}</>}
          {" "}<span className="text-ink-3">({d.open_opportunities[0].stage})</span>
        </p>
      )}
      {lastInt && (
        <p className="mt-1.5 text-[13px] text-ink-2">
          <span className="text-ink-3">Last touch:</span> {lastInt.kind} · {fmtDay(lastInt.occurred_at)}
          {lastInt.subject && !lastInt.is_private && <> — {lastInt.subject}</>}
        </p>
      )}
    </div>
  );
}

function PartnerCard({ d, first, prior }: { d: PartnerDossier; first: boolean; prior: number }) {
  const lastInt = d.recent_interactions[0];
  return (
    <div className="rounded-card border border-outline bg-tile/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/admin/partners/${d.id}`} className="text-[15px] font-medium text-ink-1 hover:text-orange transition-colors">
          {d.profile.name}
        </Link>
        <FirstMeetingBadge first={first} prior={prior} />
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Status" value={d.profile.status ?? "—"} />
        <Stat label="MOU" value={d.profile.mou_status ?? "—"} />
        <Stat label="Teens" value={d.profile.teen_count ?? "—"} />
        <Stat label="Last touch" value={fmtDay(d.profile.last_touch_at)} />
      </div>
      {d.profile.champion && <p className="mt-3 text-[13px] text-ink-2"><span className="text-ink-3">Champion:</span> {d.profile.champion}</p>}
      {lastInt && (
        <p className="mt-1.5 text-[13px] text-ink-2">
          <span className="text-ink-3">Last touch:</span> {lastInt.kind} · {fmtDay(lastInt.occurred_at)}
          {lastInt.preview && <> — {lastInt.preview.slice(0, 100)}</>}
        </p>
      )}
    </div>
  );
}

export default async function UpcomingMeetingDetailPage({ params }: { params: { eventId: string } }) {
  const detail: UpcomingMeetingDetail | null = await getUpcomingMeetingDetail(params.eventId);
  if (!detail) notFound();
  const { brief, constituents, partners, agenda } = detail;

  const consById = new Map(constituents.map((d) => [d.id, d]));
  const partById = new Map(partners.map((d) => [d.id, d]));

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <header>
        <Link href="/admin/meetings" className="text-xs text-ink-2 hover:text-ink-1 inline-flex items-center gap-1 mb-3">
          ← Meetings
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none">
              {brief.title ?? "Untitled meeting"}
            </h1>
            <p className="mt-2 text-sm text-ink-2">{fmtDateTime(brief.start)} · Upcoming</p>
          </div>
          <div className="pt-1">
            <MeetingAgendaButton
              eventId={brief.event_id}
              title={brief.title}
              start={brief.start}
              size="md"
              label={agenda ? "Regenerate with Reed" : "Prep with Reed"}
            />
          </div>
        </div>
      </header>

      {/* Who it's with — dossiers inline. */}
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface p-6">
        <SectionTitle count={brief.entities.length || undefined}>Who it&apos;s with</SectionTitle>
        {brief.entities.length === 0 ? (
          <p className="text-sm text-ink-2 italic">
            No attendee matched a donor or partner — this meeting is unmatched. Reed can still prep from the title and attendees.
          </p>
        ) : (
          <div className="space-y-3">
            {brief.entities.map((e) => {
              const cd = e.type === "constituent" ? consById.get(e.id) : undefined;
              const pd = e.type === "partner" ? partById.get(e.id) : undefined;
              if (cd) return <ConstituentCard key={`c:${e.id}`} d={cd} first={e.is_first_meeting} prior={e.prior_touchpoints} />;
              if (pd) return <PartnerCard key={`p:${e.id}`} d={pd} first={e.is_first_meeting} prior={e.prior_touchpoints} />;
              return (
                <div key={`x:${e.id}`} className="rounded-card border border-outline bg-tile/40 p-4 flex items-center justify-between gap-3">
                  <span className="text-[15px] text-ink-1">{e.name}</span>
                  <span className="text-[11px] text-ink-3 italic">No read access to this {e.type === "partner" ? "partner" : "donor"}&apos;s record</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Reed's agenda — auto-persisted from the meeting-prep thread. */}
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <SectionTitle>Reed&apos;s agenda</SectionTitle>
          {agenda && <span className="text-[11px] text-ink-3">Generated {fmtRelDay(agenda.generatedAt)}</span>}
        </div>
        {agenda ? (
          <p className="text-sm text-ink-1 leading-relaxed whitespace-pre-wrap">{agenda.agenda}</p>
        ) : (
          <p className="text-sm text-ink-2 italic">
            No agenda yet. Hit{" "}
            <span className="font-medium text-ink-1">Prep with Reed</span> — he&apos;ll research who you&apos;re meeting,
            review your history, and draft a tailored agenda for {brief.entities.some((e) => e.is_first_meeting) ? "this first meeting" : "the next touchpoint"}.
          </p>
        )}
      </section>
    </div>
  );
}
