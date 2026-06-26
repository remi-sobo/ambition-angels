"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AgendaItem } from "@/lib/agenda/service";

const STALE_MIN = 20; // synced longer ago than this → ochre tick
const MIN_OFFSET = -7; // matches AgendaShelf's fetch window
const MAX_OFFSET = 7;

function makeFmt(tz: string) {
  const ymd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = (iso: string, allDay: boolean) =>
    allDay
      ? "All day"
      : new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return { ymd, time };
}

/** Shift a YYYY-MM-DD key by whole days (UTC-based, no DST drift). */
function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function dayLabel(offset: number, key: string): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return new Date(key + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function relative(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: "not synced yet", stale: true };
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const stale = mins >= STALE_MIN;
  if (mins < 1) return { text: "synced just now", stale };
  if (mins < 60) return { text: `synced ${mins}m ago`, stale };
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return { text: `synced ${hrs}h ago`, stale };
  return { text: `synced ${Math.round(hrs / 24)}d ago`, stale };
}

/** Compact agenda for the rail: navigate day by day; today emphasizes "up next". */
export default function RailAgenda({
  items,
  timeZone,
  syncedAt,
}: {
  items: AgendaItem[];
  timeZone: string;
  syncedAt: string | null;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const fmt = useMemo(() => makeFmt(timeZone), [timeZone]);

  const todayKey = fmt.ymd(new Date());
  const selectedKey = addDaysKey(todayKey, offset);
  const isToday = offset === 0;

  const { tile, list, empty } = useMemo(() => {
    const dayKeyOf = (e: AgendaItem) => (e.allDay ? e.start.slice(0, 10) : fmt.ymd(new Date(e.start)));
    const dayItems = items
      .filter((e) => dayKeyOf(e) === selectedKey)
      .sort((a, b) => a.start.localeCompare(b.start));

    if (isToday) {
      // Today: emphasize the next upcoming event; show what's still ahead.
      const now = Date.now();
      const ended = (e: AgendaItem) => !e.allDay && new Date(e.end ?? e.start).getTime() < now;
      const ahead = dayItems.filter((e) => !ended(e));
      const t = ahead[0] ?? null;
      return { tile: t, list: ahead.slice(t ? 1 : 0, 4), empty: dayItems.length === 0 };
    }
    // Other days: a plain chronological list of everything that day.
    return { tile: null as AgendaItem | null, list: dayItems.slice(0, 8), empty: dayItems.length === 0 };
  }, [items, selectedKey, isToday, fmt]);

  const freshness = relative(syncedAt);

  async function refresh() {
    setRefreshing(true);
    try {
      await fetch("/api/admin/agenda/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="px-5 py-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-[10px] font-heading font-semibold uppercase tracking-[0.14em] text-ink-3">
          <span className="w-[3px] h-3 rounded-full bg-orange" aria-hidden />
          Agenda
        </h2>
        <button
          onClick={refresh}
          disabled={refreshing}
          title="Refresh calendar"
          className={`text-[11px] ${freshness.stale ? "text-orange" : "text-ink-3"} hover:text-ink-2 disabled:opacity-50 transition-colors`}
        >
          {refreshing ? "syncing…" : freshness.text}
        </button>
      </div>

      {/* Day-by-day navigator */}
      <div className="flex items-center justify-between mb-2.5">
        <button
          onClick={() => setOffset((o) => Math.max(MIN_OFFSET, o - 1))}
          disabled={offset <= MIN_OFFSET}
          aria-label="Previous day"
          className="w-6 h-6 rounded-md flex items-center justify-center text-ink-3 hover:text-ink-1 hover:bg-tile disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <Chevron dir="left" />
        </button>
        <button
          onClick={() => setOffset(0)}
          className={`text-[12px] font-medium transition-colors ${isToday ? "text-ink-1" : "text-orange hover:text-orange-dark"}`}
          title={isToday ? undefined : "Back to today"}
        >
          {dayLabel(offset, selectedKey)}
        </button>
        <button
          onClick={() => setOffset((o) => Math.min(MAX_OFFSET, o + 1))}
          disabled={offset >= MAX_OFFSET}
          aria-label="Next day"
          className="w-6 h-6 rounded-md flex items-center justify-center text-ink-3 hover:text-ink-1 hover:bg-tile disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <Chevron dir="right" />
        </button>
      </div>

      {tile && (
        <div className="relative bg-tile rounded-card border border-hairline overflow-hidden">
          <span className="absolute left-0 top-0 bottom-0 w-1 bg-orange" aria-hidden />
          <div className="pl-4 pr-3 py-3">
            <div className="flex items-baseline gap-2.5">
              <span className="text-[13px] font-medium text-ink-1 [font-variant-numeric:tabular-nums] flex-shrink-0">
                {fmt.time(tile.start, tile.allDay)}
              </span>
              <span className="text-[13px] font-semibold text-ink-1 truncate min-w-0">{tile.title}</span>
            </div>
            {tile.isExternal && (
              <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-ink-2 bg-tile border border-outline rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange" aria-hidden />
                External
              </span>
            )}
          </div>
        </div>
      )}

      {list.length > 0 && (
        <ul className={`${tile ? "mt-2.5" : ""} space-y-2`}>
          {list.map((e) => (
            <li key={e.id} className="flex items-baseline gap-3 px-1">
              <span className="text-[12px] text-ink-2 [font-variant-numeric:tabular-nums] w-14 flex-shrink-0">
                {fmt.time(e.start, e.allDay)}
              </span>
              <span className="text-[13px] text-ink-2 truncate min-w-0">{e.title}</span>
              {e.isExternal && (
                <span className="w-1.5 h-1.5 rounded-full bg-orange flex-shrink-0 self-center" title="External attendee" />
              )}
            </li>
          ))}
        </ul>
      )}

      {!tile && list.length === 0 && (
        <p className="text-[13px] text-ink-3 py-1">
          {empty && isToday
            ? syncedAt
              ? "Nothing scheduled today."
              : "Connect your calendar to see today."
            : isToday
              ? "That’s a wrap for today."
              : "Nothing scheduled."}
        </p>
      )}

      <Link
        href="/admin/ops/monday"
        className="mt-3 inline-block text-[13px] font-medium text-orange hover:text-orange-dark transition-colors"
      >
        Plan the week →
      </Link>
    </section>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points={dir === "right" ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
    </svg>
  );
}
