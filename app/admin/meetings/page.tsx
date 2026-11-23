import Link from "next/link";
import EmptyState from "../_components/EmptyState";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import type { Booking, MeetingType } from "@/lib/database.types";
import { listMeetings, type MeetingListItem, type UpcomingMeeting } from "@/lib/meetings/read";
import { meetingFollowUpGaps } from "@/lib/meetings/coverage";
import { MatchCluster, StatusPill, SectionTitle } from "./_ui";
import SyncMeetingsButton from "./SyncMeetingsButton";
import MeetingAgendaButton from "./_components/MeetingAgendaButton";
import FollowUpQuickActions from "./_components/FollowUpQuickActions";
import CancelBookingButton from "./_components/CancelBookingButton";
import PageHeader from "../_components/PageHeader";
import Figure, { SummaryStrip } from "../_components/ui/Figure";
import Notice from "../_components/ui/Notice";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

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
      className={`group flex items-center gap-3 px-4 py-3 rounded-panel border transition-all ${
        emphasize
          ? "border-status-watch/40 bg-status-watch-bg/50 hover:bg-status-watch-bg"
          : "border-hairline bg-surface hover:bg-tile"
      }`}
    >
      <Link href={`/admin/work/meetings/${record.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] text-ink-1 group-hover:text-orange font-medium truncate transition-colors">
            {record.title ?? "Untitled meeting"}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-ink-2">
          <MatchCluster matched={matched} />
          <span className="text-ink-3">·</span>
          <span className="text-xs text-ink-3 font-mono shrink-0">{fmtPastDate(record.occurred_at)}</span>
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

type BookingWithType = Booking & { meeting_type: MeetingType | null };

// One upcoming list: calendar events (badged when a /meet booking created
// them, joined on google_event_id) plus any confirmed booking the calendar
// mirror hasn't picked up yet.
type UpcomingRow =
  | { kind: "event"; meeting: UpcomingMeeting; booking: BookingWithType | null }
  | { kind: "booking"; booking: BookingWithType };

const rowStart = (r: UpcomingRow) =>
  r.kind === "event" ? r.meeting.start : r.booking.start_time;

// The chip that marks a row as booked through the public booking page.
function BookedChip({ typeName }: { typeName?: string | null }) {
  return (
    <span
      className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full border border-orange/30 bg-orange-light text-xs font-medium text-orange-dark"
      title="Booked through your booking page"
    >
      {typeName ? `Booked · ${typeName}` : "Booked"}
    </span>
  );
}

export default async function MeetingsPage() {
  const roleGate = await requirePagePermission("ops.read", "Meetings");
  if (!roleGate.ok) return roleGate.page;
  const now = new Date();
  const { past, upcoming } = await listMeetings(now);
  const ctx = await getOrgContext();
  const coverage = ctx
    ? await meetingFollowUpGaps(getSupabaseAdmin(), ctx.orgId, now)
    : { gapCount: 0, total: 0, windowDays: 14 };

  // Confirmed future bookings from the public booking page, for the badge +
  // cancel join. Org fence: service-role client, scoped by org_id.
  const { data: bookingRows } = ctx
    ? await getSupabaseAdmin()
        .from("bookings")
        .select("*, meeting_type:meeting_types(*)")
        .eq("org_id", ctx.orgId)
        .eq("status", "confirmed")
        .gte("start_time", now.toISOString())
        .order("start_time", { ascending: true })
        .limit(100)
    : { data: [] };
  const bookings = (bookingRows ?? []) as BookingWithType[];
  const bookingByGoogleId = new Map(
    bookings
      .filter((b) => b.google_event_id)
      .map((b) => [b.google_event_id as string, b])
  );
  // Bookings the calendar mirror hasn't synced yet still deserve a row —
  // otherwise a fresh booking is invisible until the next sync.
  const syncedGoogleIds = new Set(
    upcoming.map((m) => m.googleEventId).filter(Boolean)
  );
  const unsyncedBookings = bookings.filter(
    (b) => !b.google_event_id || !syncedGoogleIds.has(b.google_event_id)
  );

  const needs = past.filter((m) => m.record.follow_up_status === "needs_follow_up");
  // Dismissed = "not a business meeting, get it out of my view" — kept out of
  // Recent, reachable (and undoable) via the collapsed section at the bottom.
  const handled = past.filter(
    (m) => m.record.follow_up_status !== "needs_follow_up" && m.record.follow_up_status !== "dismissed"
  );
  const dismissed = past.filter((m) => m.record.follow_up_status === "dismissed");

  // Group the merged upcoming rows by day, sorted by start within each day.
  const todayKey = laDayKey(now.toISOString());
  const upcomingRows: UpcomingRow[] = [
    ...upcoming.map((m) => ({
      kind: "event" as const,
      meeting: m,
      booking: m.googleEventId
        ? bookingByGoogleId.get(m.googleEventId) ?? null
        : null,
    })),
    ...unsyncedBookings.map((b) => ({ kind: "booking" as const, booking: b })),
  ];
  const byDay = new Map<string, UpcomingRow[]>();
  for (const r of upcomingRows) {
    const k = laDayKey(rowStart(r));
    const arr = byDay.get(k) ?? [];
    arr.push(r);
    byDay.set(k, arr);
  }
  byDay.forEach((arr) => {
    arr.sort((a, b) => rowStart(a).localeCompare(rowStart(b)));
  });
  const days = Array.from(byDay.keys()).sort();

  const coverageSource = `Of ${coverage.total} in the last ${coverage.windowDays} days, from your meeting records`;
  const bookedCount = upcomingRows.filter((r) => (r.kind === "event" ? !!r.booking : true)).length;

  return (
    <div className="max-w-workspace px-4 lg:px-8 py-6 lg:py-8 space-y-8">
      <div>
        <PageHeader
          title="Meetings"
          subtitle="Your meetings, matched to the donors and partners they concern"
          primaryAction={<SyncMeetingsButton />}
          moreActions={[
            { label: "My Week", href: "/admin/work/my-week" },
            { label: "Booking page settings", href: "/admin/settings/organization/booking-page" },
            { label: "Calendar connection", href: "/admin/settings/connections" },
          ]}
        />

        {/* The summary strip replaces the old orange coverage hero: the
            follow-up gap is still the first figure, sourced, and late reads
            in the danger tone, not as decoration (V4 Stage G). */}
        <SummaryStrip label="Meetings summary">
          <Figure
            label="Need a follow-up"
            value={ctx ? coverage.gapCount : null}
            source={coverageSource}
            compareTone="danger"
            compare={coverage.gapCount > 0 ? "Open one below to add a follow-up" : undefined}
          />
          <Figure label="Upcoming" value={upcomingRows.length} source="External meetings and bookings ahead, from your calendar" />
          <Figure label="Booked through your page" value={bookedCount} source="Confirmed bookings from your booking page" />
        </SummaryStrip>

        {coverage.gapCount === 0 && past.length > 0 ? (
          <Notice tone="success" title="All caught up.">
            Every recent meeting has a follow-up or does not need one.
          </Notice>
        ) : null}
      </div>

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
          <summary className="cursor-pointer list-none inline-flex items-center gap-2 text-xs text-ink-3 hover:text-ink-1 transition-colors">
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
        <EmptyState
          label="meeting records"
          hint={
            <>
              Choose <span className="font-medium text-ink-1">Sync from calendar</span> above to pull
              your past external meetings in and match them to donors and partners.
            </>
          }
        />
      )}

      {/* Upcoming — grouped by day, scannable. Calendar meetings and booking-
          page bookings in one list; booked rows carry a chip + inline cancel. */}
      <section>
        <SectionTitle count={upcomingRows.length}>Upcoming</SectionTitle>
        {upcomingRows.length === 0 ? (
          <p className="text-sm text-ink-2 px-1">No upcoming external meetings on the calendar.</p>
        ) : (
          <div className="space-y-5">
            {days.map((key) => {
              const head = dayHeading(key, todayKey);
              const isToday = key === todayKey;
              return (
                <div key={key}>
                  <div className="flex items-baseline gap-2 mb-2 px-1">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? "text-orange" : "text-ink-2"}`}>
                      {head.label}
                    </span>
                    {head.sub && <span className="text-xs text-ink-3">· {head.sub}</span>}
                  </div>
                  <div className="space-y-1.5">
                    {(byDay.get(key) ?? []).map((r) =>
                      r.kind === "event" ? (
                        <div
                          key={r.meeting.eventId}
                          className="group flex items-center gap-3 px-4 py-2.5 rounded-panel border border-hairline bg-surface transition-colors hover:bg-tile"
                        >
                          <Link href={`/admin/work/meetings/upcoming/${r.meeting.eventId}`} className="flex flex-1 min-w-0 items-center gap-3">
                            <span className="text-xs text-ink-2 font-mono [font-variant-numeric:tabular-nums] w-20 shrink-0">
                              {laTime(r.meeting.start)}
                            </span>
                            <span className="flex-1 min-w-0 text-[14px] text-ink-1 group-hover:text-orange truncate transition-colors">
                              {r.meeting.title ?? "Untitled meeting"}
                            </span>
                            {r.booking && <BookedChip typeName={r.booking.meeting_type?.name} />}
                            <MatchCluster matched={r.meeting.matched} muted />
                          </Link>
                          <MeetingAgendaButton eventId={r.meeting.eventId} title={r.meeting.title} start={r.meeting.start} />
                          {r.booking && <CancelBookingButton bookingId={r.booking.id} />}
                        </div>
                      ) : (
                        // A booking the calendar mirror hasn't synced yet — no
                        // event to open, but it's real and cancellable.
                        <div
                          key={r.booking.id}
                          className="flex items-center gap-3 px-4 py-2.5 rounded-panel border border-hairline bg-surface"
                        >
                          <span className="text-xs text-ink-2 font-mono [font-variant-numeric:tabular-nums] w-20 shrink-0">
                            {laTime(r.booking.start_time)}
                          </span>
                          <span className="flex-1 min-w-0 text-[14px] text-ink-1 truncate">
                            {r.booking.attendee_name}
                          </span>
                          <BookedChip typeName={r.booking.meeting_type?.name} />
                          <CancelBookingButton bookingId={r.booking.id} />
                        </div>
                      )
                    )}
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
