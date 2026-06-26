import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { listMeetings, type MeetingListItem, type UpcomingMeeting } from "@/lib/meetings/read";
import { meetingFollowUpGaps } from "@/lib/meetings/coverage";
import { FOLLOW_UP_LABEL, type FollowUpStatus, type MatchedEntity } from "@/lib/meetings/types";
import SyncMeetingsButton from "./SyncMeetingsButton";

export const dynamic = "force-dynamic";

const ORG_TZ = "America/Los_Angeles";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: ORG_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_BADGE: Record<FollowUpStatus, string> = {
  needs_follow_up: "bg-status-watch-bg text-ink-1 border-status-watch/30",
  has_follow_up: "bg-status-healthy-bg text-ink-1 border-status-healthy/30",
  none_needed: "bg-status-neutral-bg text-ink-2 border-outline",
  dismissed: "bg-status-neutral-bg text-ink-2 border-outline",
};

function EntityChips({ matched }: { matched: MatchedEntity[] }) {
  if (matched.length === 0) {
    return <span className="text-[11px] text-ink-3 italic">unmatched</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {matched.slice(0, 3).map((e) => (
        <span
          key={`${e.type}:${e.id}`}
          className="inline-flex items-center gap-1 text-[11px] text-ink-2 bg-tile border border-outline rounded-full px-2 py-0.5"
        >
          <span className="text-ink-3">{e.type === "partner" ? "◆" : "♥"}</span>
          {e.name}
        </span>
      ))}
      {matched.length > 3 && (
        <span className="text-[11px] text-ink-3">+{matched.length - 3}</span>
      )}
    </span>
  );
}

export default async function MeetingsPage() {
  const now = new Date();
  const { past, upcoming } = await listMeetings(now);
  const ctx = await getOrgContext();
  const coverage = ctx
    ? await meetingFollowUpGaps(getSupabaseAdmin(), ctx.orgId, now)
    : { gapCount: 0, total: 0, windowDays: 14 };

  return (
    <div className="max-w-6xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none">
            Meetings
          </h1>
          <p className="mt-2 text-sm text-ink-2">
            Your meetings, matched to the donors and partners they concern.
          </p>
        </div>
        <SyncMeetingsButton />
      </header>

      {coverage.gapCount > 0 && (
        <div className="rounded-card border border-[#D9BE86] bg-amber-500/[0.04] p-4">
          <p className="text-sm text-ink-1">
            <span className="font-semibold">{coverage.gapCount}</span> of{" "}
            {coverage.total} meeting{coverage.total === 1 ? "" : "s"} in the last{" "}
            {coverage.windowDays} days {coverage.gapCount === 1 ? "has" : "have"} no
            follow-up. Open one to add a follow-up or mark it as not needed.
          </p>
        </div>
      )}

      {/* Upcoming */}
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-4">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-2">No upcoming external meetings on the calendar.</p>
        ) : (
          <div className="space-y-1.5">
            {upcoming.map((m: UpcomingMeeting) => (
              <div
                key={m.eventId}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-outline bg-surface shadow-panel"
              >
                <span className="flex-1 min-w-0 text-sm text-ink-1 truncate">
                  {m.title ?? "(untitled meeting)"}
                </span>
                <EntityChips matched={m.matched} />
                <span className="shrink-0 text-[11px] text-ink-2 font-mono">
                  {fmtDateTime(m.start)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past */}
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-4">Past meetings</h2>
        {past.length === 0 ? (
          <p className="text-sm text-ink-2">
            No meeting records yet. Click <span className="font-medium">Sync from calendar</span>{" "}
            to pull past external meetings in.
          </p>
        ) : (
          <div className="space-y-1.5">
            {past.map((m: MeetingListItem) => (
              <Link
                key={m.record.id}
                href={`/admin/meetings/${m.record.id}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-outline bg-surface shadow-panel hover:bg-[#EFE6D4] transition-colors group"
              >
                <span className="flex-1 min-w-0 text-sm text-ink-1 group-hover:text-orange truncate">
                  {m.record.title ?? "(untitled meeting)"}
                </span>
                <EntityChips matched={m.matched} />
                <span
                  className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${STATUS_BADGE[m.record.follow_up_status]}`}
                >
                  {FOLLOW_UP_LABEL[m.record.follow_up_status]}
                </span>
                <span className="shrink-0 text-[11px] text-ink-2 font-mono w-32 text-right">
                  {fmtDateTime(m.record.occurred_at)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
