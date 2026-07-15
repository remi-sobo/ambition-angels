import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { listMeetings, type MeetingListItem, type UpcomingMeeting } from "@/lib/meetings/read";
import { meetingFollowUpGaps } from "@/lib/meetings/coverage";
import { MatchCluster, StatusPill, SectionTitle } from "./_ui";
import SyncMeetingsButton from "./SyncMeetingsButton";
import MeetingAgendaButton from "./_components/MeetingAgendaButton";
import FollowUpQuickActions from "./_components/FollowUpQuickActions";
import { TYPE } from "@/lib/admin/typeScale";

export const dynamic = "force-dynamic";

const ORG_TZ = "America/Los_Angeles";

// ── date helpers (all in the org timezone) ──────────────────────────────────
function laDayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
function laTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: ORG_TZ, hour: "numeric", minute: "2-digit" });
}
function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function dayHeading(key: string, todayKey: string): { label: string; sub: string } {
  const long = new Date(key + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  if (key === todayKey) return { label: "Today", sub: long };
  if (key === addDaysKey(todayKey, 1)) return { label: "Tomorrow", sub: long };
  return { label: long, sub: "" };
}
function fmtPastDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: ORG_TZ, month: "short", day: "numeric" });
}

// A past meeting: matched entity leads, status (or quick actions) on the
// right. The row body links in; actions sit outside the link so clearing a
// personal event never requires opening the record.
function PastRow({ item, emphasize = false }: { item: MeetingListItem; emphasize?: boolean }) {
  const { record, matched } = item;
  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3 rounded-card border transition-all ${
        emphasize
          ? "border-status-watch/40 bg-status-watch-bg/50 hover:bg-status-watch-bg shadow-panel"
          : "border-outline bg-surface shadow-panel hover:bg-[#EFE6D4]"
      }`}
    >
      <Link href={`/admin/meetings/${record.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] text-ink-1 group-hover:text-orange font-medium truncate transition-colors">
            {record.title ?? "Untitled meeting"}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-ink-2">
          <MatchCluster matched={matched} />
          <span className="text-ink-3">·</span>
          <span className="text-[11px] text-ink-3 font-mono shrink-0">{fmtPastDate(record.occurred_at)}</span>
        </div>
      </Link>
      {emphasize ? (
        <FollowUpQuickActions recordId={record.id} />
      ) : (
        <StatusPill status={record.follow_up_status} />
      )}
    </div>
  );
}

export default async function MeetingsPage() {
  const now = new Date();
  const { past, upcoming } = await listMeetings(now);
  const ctx = await getOrgContext();
  const coverage = ctx
    ? await meetingFollowUpGaps(getSupabaseAdmin(), ctx.orgId, now)
    : { gapCount: 0, total: 0, windowDays: 14 };

  const needs = past.filter((m) => m.record.follow_up_status === "needs_follow_up");
  // Dismissed = "not a business meeting, get it out of my view" — kept out of
  // Recent, reachable (and undoable) via the collapsed section at the bottom.
  const handled = past.filter(
    (m) => m.record.follow_up_status !== "needs_follow_up" && m.record.follow_up_status !== "dismissed"
  );
  const dismissed = past.filter((m) => m.record.follow_up_status === "dismissed");

  // Group upcoming by day, in order.
  const todayKey = laDayKey(now.toISOString());
  const byDay = new Map<string, UpcomingMeeting[]>();
  for (const m of upcoming) {
    const k = laDayKey(m.start);
    const arr = byDay.get(k) ?? [];
    arr.push(m);
    byDay.set(k, arr);
  }
  const days = Array.from(byDay.keys()).sort();

  return (
    <div className="max-w-5xl px-4 lg:px-8 py-6 lg:py-8 space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className={TYPE.displayTitleLg}>
            Meetings
          </h1>
          <p className="mt-2 text-sm text-ink-2">
            Your meetings, matched to the donors and partners they concern.
          </p>
        </div>
        <SyncMeetingsButton />
      </header>

      {/* Coverage hero — the load-bearing signal, not a footnote. */}
      {coverage.gapCount > 0 ? (
        <section className="relative overflow-hidden rounded-card-lg border border-orange/30 bg-orange-light">
          <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange" aria-hidden />
          <div className="px-6 py-5 flex items-center gap-5">
            <span className="font-display font-black text-orange text-5xl leading-none [font-variant-numeric:tabular-nums]">
              {coverage.gapCount}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink-1">
                {coverage.gapCount === 1 ? "meeting needs a follow-up" : "meetings need a follow-up"}
              </p>
              <p className="text-[13px] text-ink-2 mt-0.5">
                of {coverage.total} in the last {coverage.windowDays} days. Open one below to add a
                follow-up or mark it as not needed.
              </p>
            </div>
          </div>
        </section>
      ) : past.length > 0 ? (
        <section className="rounded-card-lg border border-status-healthy/30 bg-status-healthy-bg px-6 py-4 flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-revenue-bg text-revenue">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="text-[14px] text-ink-1 font-medium">
            All caught up — every recent meeting has a follow-up or doesn&apos;t need one.
          </p>
        </section>
      ) : null}

      {/* Needs follow-up — the action list, emphasized. */}
      {needs.length > 0 && (
        <section>
          <SectionTitle count={needs.length}>Needs your follow-up</SectionTitle>
          <div className="space-y-2">
            {needs.map((m) => (
              <PastRow key={m.record.id} item={m} emphasize />
            ))}
          </div>
        </section>
      )}

      {/* Recent meetings — already handled. */}
      {handled.length > 0 && (
        <section>
          <SectionTitle count={handled.length}>Recent meetings</SectionTitle>
          <div className="space-y-2">
            {handled.map((m) => (
              <PastRow key={m.record.id} item={m} />
            ))}
          </div>
        </section>
      )}

      {/* Dismissed — collapsed so personal events stay out of the way but can
          still be reopened if one was dismissed by mistake. */}
      {dismissed.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none inline-flex items-center gap-2 text-[12px] text-ink-3 hover:text-ink-1 transition-colors">
            <svg viewBox="0 0 16 16" className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dismissed ({dismissed.length})
          </summary>
          <div className="mt-3 space-y-2">
            {dismissed.map((m) => (
              <PastRow key={m.record.id} item={m} />
            ))}
          </div>
        </details>
      )}

      {past.length === 0 && (
        <section className="rounded-card-lg border border-dashed border-outline bg-surface px-6 py-10 text-center">
          <p className="text-sm text-ink-2">
            No meeting records yet. Hit <span className="font-medium text-ink-1">Sync from calendar</span> to
            pull your past external meetings in and match them to donors and partners.
          </p>
        </section>
      )}

      {/* Upcoming — grouped by day, scannable. */}
      <section>
        <SectionTitle count={upcoming.length}>Upcoming</SectionTitle>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-2 px-1">No upcoming external meetings on the calendar.</p>
        ) : (
          <div className="space-y-5">
            {days.map((key) => {
              const head = dayHeading(key, todayKey);
              const isToday = key === todayKey;
              return (
                <div key={key}>
                  <div className="flex items-baseline gap-2 mb-2 px-1">
                    <span className={`text-[12px] font-semibold uppercase tracking-wider ${isToday ? "text-orange" : "text-ink-2"}`}>
                      {head.label}
                    </span>
                    {head.sub && <span className="text-[11px] text-ink-3">· {head.sub}</span>}
                  </div>
                  <div className="space-y-1.5">
                    {(byDay.get(key) ?? []).map((m) => (
                      <div
                        key={m.eventId}
                        className="group flex items-center gap-3 px-4 py-2.5 rounded-card border border-outline bg-surface shadow-panel transition-colors hover:bg-[#EFE6D4]"
                      >
                        <Link href={`/admin/meetings/upcoming/${m.eventId}`} className="flex flex-1 min-w-0 items-center gap-3">
                          <span className="text-[12px] text-ink-2 font-mono [font-variant-numeric:tabular-nums] w-20 shrink-0">
                            {laTime(m.start)}
                          </span>
                          <span className="flex-1 min-w-0 text-[14px] text-ink-1 group-hover:text-orange truncate transition-colors">
                            {m.title ?? "Untitled meeting"}
                          </span>
                          <MatchCluster matched={m.matched} muted />
                        </Link>
                        <MeetingAgendaButton eventId={m.eventId} title={m.title} start={m.start} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
