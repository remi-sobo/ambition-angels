"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Times/days are formatted with an explicit timeZone so server and client agree
// (deterministic Intl), matching the Schedule widget's approach.
export type AgendaItemView = {
  id: string;
  ownerUserId: string | null;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  isExternal: boolean;
  source: "google" | "booking" | "bloomos";
};

export type AgendaLane = { userId: string; label: string };

const STALE_MIN = 20; // synced longer ago than this → ochre

function makeFmt(tz: string) {
  const ymd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const dayLabel = (key: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(
      new Date(key + "T12:00:00Z")
    );
  const time = (iso: string, allDay: boolean) =>
    allDay ? "All day" : new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return { ymd, dayLabel, time };
}

function relative(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: "not synced yet", stale: true };
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const stale = mins >= STALE_MIN;
  if (mins < 1) return { text: "synced just now", stale };
  if (mins < 60) return { text: `synced ${mins} min ago`, stale };
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return { text: `synced ${hrs} hr ago`, stale };
  return { text: `synced ${Math.round(hrs / 24)} day(s) ago`, stale };
}

export default function AgendaList({
  items,
  timeZone,
  syncedAt,
  names,
  multiOwner,
  lanes,
}: {
  items: AgendaItemView[];
  timeZone: string;
  syncedAt: string | null;
  names: Record<string, string>;
  multiOwner: boolean;
  /** When set, render one column per calendar (ops two-lane view). */
  lanes?: AgendaLane[];
}) {
  const router = useRouter();
  const [view, setView] = useState<"day" | "week">("day");
  const [refreshing, setRefreshing] = useState(false);
  const fmt = useMemo(() => makeFmt(timeZone), [timeZone]);

  const keys = useMemo(() => {
    const todayKey = fmt.ymd(new Date());
    return {
      todayKey,
      tomorrowKey: fmt.ymd(new Date(Date.now() + 86400000)),
      weekEndKey: fmt.ymd(new Date(Date.now() + 7 * 86400000)),
    };
  }, [fmt]);

  const labelFor = (key: string) =>
    key === keys.todayKey ? "Today" : key === keys.tomorrowKey ? "Tomorrow" : fmt.dayLabel(key);

  // Group a subset of items into [dayKey, items][], filtered to the active view.
  const groupOf = (subset: AgendaItemView[]) => {
    const dayKeyOf = (e: AgendaItemView) => (e.allDay ? e.start.slice(0, 10) : fmt.ymd(new Date(e.start)));
    const map = new Map<string, AgendaItemView[]>();
    for (const e of subset) {
      const key = dayKeyOf(e);
      if (key < keys.todayKey) continue;
      if (view === "day" && key !== keys.todayKey) continue;
      if (view === "week" && key > keys.weekEndKey) continue;
      (map.get(key) ?? map.set(key, []).get(key)!).push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  };

  const renderGroups = (groups: [string, AgendaItemView[]][], showChips: boolean) =>
    groups.length === 0 ? (
      <p className="text-sm text-ink-3 py-2">{view === "day" ? "Nothing today." : "Nothing this week."}</p>
    ) : (
      <ul className="space-y-1.5">
        {groups.map(([key, dayItems]) => (
          <li key={key}>
            <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mt-3 first:mt-0 mb-1">
              {labelFor(key)}
            </div>
            <ul className="space-y-1.5">
              {dayItems.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3">
                  <span className="text-[11px] text-ink-2 [font-variant-numeric:tabular-nums] w-16 flex-shrink-0">
                    {fmt.time(e.start, e.allDay)}
                  </span>
                  <span className="text-sm text-ink-1 font-medium truncate min-w-0">{e.title}</span>
                  {e.isExternal && (
                    <span className="w-1.5 h-1.5 rounded-full bg-orange flex-shrink-0 self-center" title="External attendee" />
                  )}
                  {showChips && e.ownerUserId && (
                    <span className="text-[10px] font-semibold text-ink-3 bg-tile border border-outline rounded-full px-1.5 py-0.5 flex-shrink-0 ml-auto">
                      {(names[e.ownerUserId] ?? "?").slice(0, 2)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    );

  const freshness = relative(syncedAt);

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        {(["day", "week"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
              view === v ? "bg-orange text-white" : "text-ink-2 hover:text-ink-1"
            }`}
          >
            {v === "day" ? "Today" : "This week"}
          </button>
        ))}
      </div>

      {lanes && lanes.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
          {lanes.map((lane) => (
            <div key={lane.userId} className="min-w-0">
              <div className="text-xs font-heading font-semibold text-ink-1 pb-1.5 mb-1 border-b border-outline">
                {lane.label}
              </div>
              {renderGroups(
                groupOf(items.filter((i) => i.ownerUserId === lane.userId)),
                false
              )}
            </div>
          ))}
        </div>
      ) : (
        renderGroups(groupOf(items), multiOwner)
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className={`text-[11px] ${freshness.stale ? "text-orange" : "text-ink-3"}`}>{freshness.text}</span>
        <button
          onClick={async () => {
            setRefreshing(true);
            try {
              await fetch("/api/admin/agenda/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
              router.refresh();
            } finally {
              setRefreshing(false);
            }
          }}
          disabled={refreshing}
          className="text-[11px] font-semibold text-ink-2 hover:text-ink-1 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
