"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AgendaItem } from "@/lib/agenda/service";

const STALE_MIN = 20; // synced longer ago than this → ochre tick

function makeFmt(tz: string) {
  const ymd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = (iso: string, allDay: boolean) =>
    allDay
      ? "All day"
      : new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return { ymd, time };
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

/** Compact agenda for the rail: up next (emphasized), then the rest of today. */
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
  const fmt = useMemo(() => makeFmt(timeZone), [timeZone]);

  const { upNext, rest, hadToday } = useMemo(() => {
    const todayKey = fmt.ymd(new Date());
    const now = Date.now();
    const dayKeyOf = (e: AgendaItem) => (e.allDay ? e.start.slice(0, 10) : fmt.ymd(new Date(e.start)));
    const todays = items.filter((e) => dayKeyOf(e) === todayKey);
    const ended = (e: AgendaItem) => !e.allDay && new Date(e.end ?? e.start).getTime() < now;
    const upcoming = todays.filter((e) => !ended(e));
    return { upNext: upcoming[0] ?? null, rest: upcoming.slice(1, 4), hadToday: todays.length > 0 };
  }, [items, fmt]);

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

      {upNext ? (
        <>
          {/* Up next — the one emphasized card: a warm recessed tile against the
              brighter rail surface, with the terracotta accent bar. */}
          <div className="relative bg-tile rounded-card border border-hairline overflow-hidden">
            <span className="absolute left-0 top-0 bottom-0 w-1 bg-orange" aria-hidden />
            <div className="pl-4 pr-3 py-3">
              <div className="flex items-baseline gap-2.5">
                <span className="text-[13px] font-medium text-ink-1 [font-variant-numeric:tabular-nums] flex-shrink-0">
                  {fmt.time(upNext.start, upNext.allDay)}
                </span>
                <span className="text-[13px] font-semibold text-ink-1 truncate min-w-0">{upNext.title}</span>
              </div>
              {upNext.isExternal && (
                <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-ink-2 bg-tile border border-outline rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange" aria-hidden />
                  External
                </span>
              )}
            </div>
          </div>

          {rest.length > 0 && (
            <ul className="mt-2.5 space-y-2">
              {rest.map((e) => (
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
        </>
      ) : (
        <p className="text-[13px] text-ink-3 py-1">
          {hadToday
            ? "That’s a wrap for today."
            : syncedAt
              ? "Nothing scheduled today."
              : "Connect your calendar to see today."}
        </p>
      )}

      <Link
        href="/meet"
        className="mt-3 inline-block text-[13px] font-medium text-orange hover:text-orange-dark transition-colors"
      >
        This week
      </Link>
    </section>
  );
}
