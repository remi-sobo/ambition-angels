"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AgendaItem } from "@/lib/agenda/service";
import { TYPE } from "@/lib/admin/typeScale";

const STALE_MIN = 20; // synced longer ago than this → ochre tick + refresh nudge
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

function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function dayLabel(offset: number, key: string): { big: string; sub: string } {
  const full = new Date(key + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  if (offset === 0) return { big: "Today", sub: full };
  if (offset === 1) return { big: "Tomorrow", sub: full };
  if (offset === -1) return { big: "Yesterday", sub: full };
  const short = new Date(key + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  return { big: short, sub: full };
}

// "Tomorrow" / "Fri, Jun 27" hint for a day key relative to today.
function hintFor(key: string, todayKey: string): string {
  if (key === addDaysKey(todayKey, 1)) return "Tomorrow";
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

/** The cockpit agenda: navigate day by day; the glowing hero rolls forward so
 *  there's always something to look at, even when today is done. */
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
  const label = dayLabel(offset, selectedKey);

  const { hero, heroHint, list, count } = useMemo(() => {
    const dayKeyOf = (e: AgendaItem) => (e.allDay ? e.start.slice(0, 10) : fmt.ymd(new Date(e.start)));
    const onDay = (k: string) =>
      items.filter((e) => dayKeyOf(e) === k).sort((a, b) => a.start.localeCompare(b.start));
    const dayItems = onDay(selectedKey);

    if (isToday) {
      const now = Date.now();
      const ended = (e: AgendaItem) => !e.allDay && new Date(e.end ?? e.start).getTime() < now;
      const ahead = dayItems.filter((e) => !ended(e));
      if (ahead.length > 0) {
        return { hero: ahead[0], heroHint: null as string | null, list: ahead.slice(1, 4), count: dayItems.length, empty: false };
      }
      // Today is done → roll the hero forward to the next event on any day.
      const next =
        items
          .filter((e) => new Date(e.start).getTime() >= now || (e.allDay && dayKeyOf(e) > todayKey))
          .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
      if (next) {
        const nk = dayKeyOf(next);
        const sameDay = onDay(nk);
        const idx = sameDay.findIndex((e) => e.id === next.id);
        return { hero: next, heroHint: hintFor(nk, todayKey), list: sameDay.slice(idx + 1, idx + 4), count: 0, empty: dayItems.length === 0 };
      }
      return { hero: null as AgendaItem | null, heroHint: null as string | null, list: [] as AgendaItem[], count: 0, empty: dayItems.length === 0 };
    }
    return { hero: null as AgendaItem | null, heroHint: null as string | null, list: dayItems.slice(0, 6), count: dayItems.length, empty: dayItems.length === 0 };
  }, [items, selectedKey, isToday, fmt, todayKey]);

  const countLabel = count === 0 ? "Clear" : `${count} event${count === 1 ? "" : "s"}`;
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
    <section className="px-5 pt-5 pb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className={`flex items-center gap-2 ${TYPE.sectionHeader} !text-[#bfae93]`}>
          <span className="w-[3px] h-3 rounded-full bg-orange" aria-hidden />
          Agenda
        </h2>
        <button
          onClick={refresh}
          disabled={refreshing}
          title="Refresh calendar"
          className={`inline-flex items-center gap-1.5 text-[11px] disabled:opacity-50 transition-colors ${
            freshness.stale
              ? "text-orange-mid hover:text-orange font-medium"
              : "text-[#8d7c63] hover:text-[#D8C9B3]"
          }`}
        >
          {refreshing ? "syncing…" : freshness.text}
          {freshness.stale && !refreshing && <RefreshGlyph />}
        </button>
      </div>

      {/* Editorial day header: big display name, full date + count, arrows flanking. */}
      <div className="flex items-center justify-between gap-2 mb-5">
        <button
          onClick={() => setOffset((o) => Math.max(MIN_OFFSET, o - 1))}
          disabled={offset <= MIN_OFFSET}
          aria-label="Previous day"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8d7c63] hover:text-[#EFE3D1] hover:bg-white/[0.06] border border-white/[0.07] disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
        >
          <Chevron dir="left" />
        </button>
        <button onClick={() => setOffset(0)} className="text-center min-w-0 group" title={isToday ? undefined : "Back to today"}>
          <div className="font-display font-black text-[26px] leading-none text-[#F5EAD8] tracking-tight">
            {label.big}
          </div>
          <div className="text-[11px] text-[#9c8b70] mt-1 group-hover:text-[#bfae93] transition-colors">
            {label.sub}
            <span className="text-[#8d7c63]"> · {countLabel}</span>
          </div>
        </button>
        <button
          onClick={() => setOffset((o) => Math.min(MAX_OFFSET, o + 1))}
          disabled={offset >= MAX_OFFSET}
          aria-label="Next day"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8d7c63] hover:text-[#EFE3D1] hover:bg-white/[0.06] border border-white/[0.07] disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
        >
          <Chevron dir="right" />
        </button>
      </div>

      {hero && (
        <>
          <p className="text-[10px] font-heading font-bold uppercase tracking-[0.16em] text-orange-mid mb-2">
            Up next
            {heroHint && <span className="text-[#9c8b70] font-semibold"> · {heroHint}</span>}
          </p>
          <div
            className="relative rounded-card border border-[rgba(232,80,10,0.35)] overflow-hidden p-4"
            style={{ backgroundImage: "linear-gradient(135deg, rgba(232,80,10,0.22), rgba(232,80,10,0.05))" }}
          >
            <span
              className="pointer-events-none absolute -right-8 -top-8 w-32 h-32 rounded-full"
              style={{ background: "radial-gradient(rgba(244,120,64,0.45), transparent 70%)" }}
              aria-hidden
            />
            <div className="relative">
              <div className="font-display font-extrabold text-[24px] leading-none text-[#FFD9C2] [font-variant-numeric:tabular-nums]">
                {fmt.time(hero.start, hero.allDay)}
              </div>
              <div className="text-[15px] font-semibold text-[#FBF3E7] mt-1.5 leading-snug">{hero.title}</div>
              {hero.isExternal && (
                <span className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-[#F0DDC9] bg-white/[0.07] border border-white/[0.12] rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange" aria-hidden />
                  External
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {list.length > 0 && (
        <ul className={`${hero ? "mt-3" : ""}`}>
          {list.map((e) => (
            <li
              key={e.id}
              className="flex items-baseline gap-3 py-2.5 border-t border-white/[0.06] first:border-t-0"
            >
              <span className="text-[12px] text-[#8d7c63] [font-variant-numeric:tabular-nums] w-[52px] flex-shrink-0">
                {fmt.time(e.start, e.allDay)}
              </span>
              <span className="text-[13px] text-[#D8C9B3] truncate min-w-0 flex-1">{e.title}</span>
              {e.isExternal && (
                <span className="w-1.5 h-1.5 rounded-full bg-orange flex-shrink-0 self-center" title="External attendee" />
              )}
            </li>
          ))}
        </ul>
      )}

      {!hero && list.length === 0 && (
        <p className="text-[13px] text-[#8d7c63] py-1">
          {syncedAt ? "Nothing on the calendar." : "Connect your calendar to see your agenda."}
        </p>
      )}

      <Link
        href="/admin/ops/monday"
        className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-orange-mid hover:text-orange transition-colors"
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

function RefreshGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}
