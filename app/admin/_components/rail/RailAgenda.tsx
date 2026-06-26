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

/** The cockpit agenda: navigate day by day, a glowing "up next" on today. */
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

  const { hero, list, empty } = useMemo(() => {
    const dayKeyOf = (e: AgendaItem) => (e.allDay ? e.start.slice(0, 10) : fmt.ymd(new Date(e.start)));
    const dayItems = items
      .filter((e) => dayKeyOf(e) === selectedKey)
      .sort((a, b) => a.start.localeCompare(b.start));

    if (isToday) {
      const now = Date.now();
      const ended = (e: AgendaItem) => !e.allDay && new Date(e.end ?? e.start).getTime() < now;
      const ahead = dayItems.filter((e) => !ended(e));
      const h = ahead[0] ?? null;
      return { hero: h, list: ahead.slice(h ? 1 : 0, 4), empty: dayItems.length === 0 };
    }
    return { hero: null as AgendaItem | null, list: dayItems.slice(0, 6), empty: dayItems.length === 0 };
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
    <section className="px-5 pt-5 pb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-[10px] font-heading font-semibold uppercase tracking-[0.14em] text-[#bfae93]">
          <span className="w-[3px] h-3 rounded-full bg-orange" aria-hidden />
          Agenda
        </h2>
        <button
          onClick={refresh}
          disabled={refreshing}
          title="Refresh calendar"
          className={`text-[11px] ${freshness.stale ? "text-orange-mid" : "text-[#8d7c63]"} hover:text-[#D8C9B3] disabled:opacity-50 transition-colors`}
        >
          {refreshing ? "syncing…" : freshness.text}
        </button>
      </div>

      {/* Editorial day header: big display name, full date beneath, arrows flanking. */}
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
          <div className="text-[11px] text-[#9c8b70] mt-1 group-hover:text-[#bfae93] transition-colors">{label.sub}</div>
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
          <p className="text-[10px] font-heading font-bold uppercase tracking-[0.16em] text-orange-mid mb-2">Up next</p>
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
