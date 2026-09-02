"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";
import { addDays, ORG_TZ } from "@/lib/admin/ops/week";
import {
  clampMin,
  formatDuration,
  formatMinuteRange,
  layoutLanes,
  PX_PER_MIN,
  SNAP_MIN,
  snapMin,
  type GridBlock,
  type GridBlockTask,
  type GridEvent,
} from "@/lib/agenda/week-grid";
import { formatHours } from "@/lib/agenda/week-summary";
import type { WeekViewData } from "@/lib/agenda/week-view";
import BlockPanel from "./BlockPanel";

/**
 * The week grid: seven day columns on an hour axis. Meetings render as fixed,
 * read-only cards; work blocks are BloomOS-owned and, on your own week,
 * pointer-driven — draw one into a gap, drag it to move, pull its bottom edge
 * to resize, click to open the panel and fill it with tasks. One handler
 * unifies click and drag: a pointer that never moved is a click.
 *
 * All positions are org-TZ minutes computed server-side; this component does
 * pixel math only. Writes are optimistic (local state first, then the API,
 * then router.refresh() to reconcile).
 */

const GUTTER_PX = 56;
const MIN_COL_PX = 118;
const RESIZE_STRIP_PX = 7;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type DayItem =
  | { kind: "event"; startMin: number; endMin: number; event: GridEvent }
  | { kind: "block"; startMin: number; endMin: number; block: GridBlock };

type Drag =
  | { kind: "create"; dayIdx: number; anchor: number; startMin: number; endMin: number; moved: boolean }
  | { kind: "move"; id: string; dayIdx: number; startMin: number; len: number; grabOffset: number; moved: boolean }
  | { kind: "resize"; id: string; dayIdx: number; startMin: number; endMin: number; moved: boolean };

/** Current org-TZ day + minutes-from-midnight, for the now line. */
function laNow(): { day: string; min: number } {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { day, min: h * 60 + m };
}

function syncedLabel(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: "not synced yet", stale: true };
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const stale = mins >= 20;
  if (mins < 1) return { text: "synced just now", stale };
  if (mins < 60) return { text: `synced ${mins} min ago`, stale };
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return { text: `synced ${hrs} hr ago`, stale };
  return { text: `synced ${Math.round(hrs / 24)} day(s) ago`, stale };
}

export default function WeekGrid({ view }: { view: WeekViewData }) {
  const router = useRouter();
  const isSelf = view.owner.relation === "self";
  const [refreshing, setRefreshing] = useState(false);

  // Optimistic layers over the server props: block geometry/list and task
  // status. Fresh server data (router.refresh) resets both.
  const [blocks, setBlocks] = useState<GridBlock[]>(view.blocks);
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({});
  const [removedLinks, setRemovedLinks] = useState<Set<string>>(new Set());
  useEffect(() => {
    setBlocks(view.blocks);
    setStatusOverride({});
    setRemovedLinks(new Set());
  }, [view.blocks, view.blockTasks]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const columnsRef = useRef<HTMLDivElement | null>(null);
  const setDragBoth = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  }, []);

  // The now line renders only after mount so SSR never bakes in a clock.
  const [nowStamp, setNowStamp] = useState<{ day: string; min: number } | null>(null);
  useEffect(() => {
    setNowStamp(laNow());
    const t = setInterval(() => setNowStamp(laNow()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Grid extent: the owner's working hours, padded an hour each side and
  // stretched to contain anything scheduled outside them.
  const { gridStart, gridEnd } = useMemo(() => {
    let start = Math.max(0, view.prefs.dayStartMinute - 60);
    let end = Math.min(1440, view.prefs.dayEndMinute + 60);
    for (const e of view.events) {
      start = Math.min(start, Math.floor(e.startMin / 60) * 60);
      end = Math.max(end, Math.ceil(e.endMin / 60) * 60);
    }
    for (const b of blocks) {
      start = Math.min(start, Math.floor(b.startMin / 60) * 60);
      end = Math.max(end, Math.ceil(b.endMin / 60) * 60);
    }
    return { gridStart: start, gridEnd: end };
  }, [view.events, blocks, view.prefs]);
  const gridHeight = (gridEnd - gridStart) * PX_PER_MIN;

  // One lane pass per day over meetings AND blocks together, so a block beside
  // a meeting shares the column instead of hiding under it. A block being
  // dragged is excluded — the preview stands in for it.
  const dayLayouts = useMemo(() => {
    const draggingId = drag && drag.kind !== "create" ? drag.id : null;
    return view.days.map((day) => {
      const items: DayItem[] = [
        ...view.events
          .filter((e) => e.day === day)
          .map((e) => ({ kind: "event" as const, startMin: e.startMin, endMin: e.endMin, event: e })),
        ...blocks
          .filter((b) => b.day === day && b.id !== draggingId)
          .map((b) => ({ kind: "block" as const, startMin: b.startMin, endMin: b.endMin, block: b })),
      ];
      return { day, items, placed: layoutLanes(items) };
    });
  }, [view.days, view.events, blocks, drag]);

  const tasksByBlock = useMemo(() => {
    const map = new Map<string, GridBlockTask[]>();
    for (const t of view.blockTasks) {
      if (removedLinks.has(t.linkId)) continue;
      const status = statusOverride[t.taskId] ?? t.status;
      const list = map.get(t.blockId) ?? [];
      list.push({ ...t, status });
      map.set(t.blockId, list);
    }
    map.forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [view.blockTasks, statusOverride, removedLinks]);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = Math.ceil(gridStart / 60) * 60; m <= gridEnd; m += 60) marks.push(m);
    return marks;
  }, [gridStart, gridEnd]);

  // ── API writes (optimistic; refresh reconciles) ──────────────────────────

  const refresh = useCallback(() => router.refresh(), [router]);

  const apiCreateBlock = useCallback(
    async (day: string, startMin: number, durationMin: number) => {
      try {
        const r = await fetch("/api/admin/calendar/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ day, start_minute: startMin, duration_minute: durationMin }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as {
          block: { id: string; title: string; google_event_id: string | null };
          synced: boolean;
        };
        setBlocks((prev) => [
          ...prev,
          {
            id: body.block.id,
            day,
            startMin,
            endMin: startMin + durationMin,
            title: body.block.title,
            synced: body.synced,
          },
        ]);
        setSelectedId(body.block.id);
        refresh();
      } catch (e) {
        console.error("Create block failed:", e);
        alert("Couldn't create the block. Try again.");
        refresh();
      }
    },
    [refresh]
  );

  const apiMoveBlock = useCallback(
    async (id: string, day: string, startMin: number, durationMin: number) => {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, day, startMin, endMin: startMin + durationMin } : b
        )
      );
      try {
        const r = await fetch(`/api/admin/calendar/blocks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ day, start_minute: startMin, duration_minute: durationMin }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        refresh();
      } catch (e) {
        console.error("Move block failed:", e);
        alert("Couldn't move the block. Try again.");
        refresh();
      }
    },
    [refresh]
  );

  const apiDeleteBlock = useCallback(
    async (id: string) => {
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      setSelectedId(null);
      try {
        const r = await fetch(`/api/admin/calendar/blocks/${id}`, { method: "DELETE" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        refresh();
      } catch (e) {
        console.error("Delete block failed:", e);
        alert("Couldn't delete the block. Try again.");
        refresh();
      }
    },
    [refresh]
  );

  const apiRetitleBlock = useCallback(
    async (id: string, title: string) => {
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, title } : b)));
      try {
        const r = await fetch(`/api/admin/calendar/blocks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        refresh();
      } catch (e) {
        console.error("Retitle block failed:", e);
        refresh();
      }
    },
    [refresh]
  );

  const apiToggleTask = useCallback(
    async (taskId: string, done: boolean) => {
      setStatusOverride((prev) => ({ ...prev, [taskId]: done ? "done" : "todo" }));
      try {
        const r = await fetch(`/api/admin/ops/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: done ? "done" : "todo" }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        refresh();
      } catch (e) {
        console.error("Toggle task failed:", e);
        setStatusOverride((prev) => ({ ...prev, [taskId]: done ? "todo" : "done" }));
      }
    },
    [refresh]
  );

  const apiAddTask = useCallback(
    async (blockId: string, taskId: string) => {
      try {
        const r = await fetch(`/api/admin/calendar/blocks/${blockId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: taskId }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        refresh();
      } catch (e) {
        console.error("Add task failed:", e);
        alert("Couldn't add the task. Try again.");
      }
    },
    [refresh]
  );

  const apiRemoveTask = useCallback(
    async (blockId: string, taskId: string, linkId: string) => {
      setRemovedLinks((prev) => new Set(prev).add(linkId));
      try {
        const r = await fetch(
          `/api/admin/calendar/blocks/${blockId}/tasks?task_id=${encodeURIComponent(taskId)}`,
          { method: "DELETE" }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        refresh();
      } catch (e) {
        console.error("Remove task failed:", e);
        refresh();
      }
    },
    [refresh]
  );

  // ── Pointer machinery (own week only) ────────────────────────────────────

  const pointFrom = useCallback(
    (ev: PointerEvent | React.PointerEvent): { dayIdx: number; min: number } | null => {
      const el = columnsRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const dayIdx = clampMin(Math.floor(((ev.clientX - rect.left) / rect.width) * 7), 0, 6);
      const min = clampMin(
        gridStart + (ev.clientY - rect.top) / PX_PER_MIN,
        gridStart,
        gridEnd
      );
      return { dayIdx, min };
    },
    [gridStart, gridEnd]
  );

  const beginCreate = useCallback(
    (ev: React.PointerEvent) => {
      if (!isSelf || ev.button !== 0) return;
      const p = pointFrom(ev);
      if (!p) return;
      const anchor = snapMin(p.min);
      setDragBoth({
        kind: "create",
        dayIdx: p.dayIdx,
        anchor,
        startMin: anchor,
        endMin: anchor + SNAP_MIN,
        moved: false,
      });
    },
    [isSelf, pointFrom, setDragBoth]
  );

  const beginBlockDrag = useCallback(
    (ev: React.PointerEvent, block: GridBlock) => {
      if (!isSelf || ev.button !== 0) return;
      ev.stopPropagation();
      const p = pointFrom(ev);
      if (!p) return;
      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      const dayIdx = view.days.indexOf(block.day);
      if (ev.clientY >= rect.bottom - RESIZE_STRIP_PX) {
        setDragBoth({
          kind: "resize",
          id: block.id,
          dayIdx,
          startMin: block.startMin,
          endMin: block.endMin,
          moved: false,
        });
      } else {
        setDragBoth({
          kind: "move",
          id: block.id,
          dayIdx,
          startMin: block.startMin,
          len: block.endMin - block.startMin,
          grabOffset: p.min - block.startMin,
          moved: false,
        });
      }
    },
    [isSelf, pointFrom, setDragBoth, view.days]
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      const p = pointFrom(ev);
      if (!d || !p) return;
      if (d.kind === "create") {
        const m = snapMin(p.min);
        setDragBoth({
          ...d,
          dayIdx: p.dayIdx,
          startMin: Math.min(d.anchor, m),
          endMin: Math.max(d.anchor, m) || d.anchor + SNAP_MIN,
          moved: d.moved || m !== d.anchor || p.dayIdx !== d.dayIdx,
        });
      } else if (d.kind === "move") {
        const start = snapMin(clampMin(p.min - d.grabOffset, gridStart, gridEnd - d.len));
        setDragBoth({
          ...d,
          dayIdx: p.dayIdx,
          startMin: start,
          moved: d.moved || start !== d.startMin || p.dayIdx !== d.dayIdx,
        });
      } else {
        const end = snapMin(clampMin(p.min, d.startMin + SNAP_MIN, gridEnd));
        setDragBoth({ ...d, endMin: end, moved: d.moved || end !== d.endMin });
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      setDragBoth(null);
      if (!d) return;
      const day = view.days[d.dayIdx];
      if (d.kind === "create") {
        const len = d.moved
          ? Math.max(d.endMin - d.startMin, SNAP_MIN)
          : Math.min(view.defaultBlockMinute, gridEnd - d.startMin);
        if (len < SNAP_MIN) return;
        void apiCreateBlock(day, d.startMin, len);
      } else if (d.kind === "move") {
        if (!d.moved) {
          setSelectedId(d.id);
          return;
        }
        void apiMoveBlock(d.id, day, d.startMin, d.len);
      } else {
        if (!d.moved) {
          setSelectedId(d.id);
          return;
        }
        void apiMoveBlock(d.id, day, d.startMin, d.endMin - d.startMin);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // dragRef mirrors drag so the handlers read fresh state without re-binding
    // on every pixel; the effect only cares whether a drag is in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, pointFrom, gridStart, gridEnd, view.days, view.defaultBlockMinute]);

  const goToWeek = (weekStart: string) => {
    const params = new URLSearchParams();
    params.set("week", weekStart);
    if (!isSelf) params.set("owner", view.owner.userId);
    router.push(`/admin/calendar?${params.toString()}`);
  };

  const freshness = syncedLabel(view.syncedAt);
  const s = view.summary;
  const selectedBlock = selectedId ? blocks.find((b) => b.id === selectedId) ?? null : null;

  return (
    <div>
      {/* Toolbar: week nav, owner switcher, summary strip */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center rounded-lg border border-outline bg-surface overflow-hidden">
          <button
            onClick={() => goToWeek(addDays(view.weekStart, -7))}
            className="px-2.5 py-1.5 text-ink-2 hover:text-ink-1 hover:bg-tile"
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            onClick={() => goToWeek(view.todayISO)}
            className="px-3 py-1.5 text-[12px] font-heading font-semibold text-ink-1 border-x border-outline hover:bg-tile"
          >
            Today
          </button>
          <button
            onClick={() => goToWeek(addDays(view.weekStart, 7))}
            className="px-2.5 py-1.5 text-ink-2 hover:text-ink-1 hover:bg-tile"
            aria-label="Next week"
          >
            ›
          </button>
        </div>

        {view.owners.length > 1 && (
          <select
            value={view.owner.userId}
            onChange={(e) => {
              const params = new URLSearchParams();
              params.set("week", view.weekStart);
              params.set("owner", e.target.value);
              router.push(`/admin/calendar?${params.toString()}`);
            }}
            className="text-[12px] font-semibold rounded-lg border border-outline bg-surface text-ink-1 px-2.5 py-1.5"
            aria-label="Whose calendar"
          >
            {view.owners.map((o) => (
              <option key={o.userId} value={o.userId}>
                {o.relation === "self" ? "My week" : o.name}
              </option>
            ))}
          </select>
        )}

        {!isSelf && (
          <span className="text-[11px] font-semibold text-ink-2 bg-tile border border-outline rounded-full px-2 py-0.5">
            read-only
          </span>
        )}

        <div className="ml-auto flex items-center gap-4">
          {(
            [
              ["Meetings", formatHours(s.meetingMin)],
              ["Blocked", formatHours(s.blockedMin)],
              ["Open", formatHours(s.openMin)],
              ["Block tasks", s.blockTasksTotal > 0 ? `${s.blockTasksDone}/${s.blockTasksTotal}` : "—"],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="text-right">
              <div className={TYPE.cardLabel}>{label}</div>
              <div className="font-heading font-semibold text-sm text-ink-1 tabular-nums">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-card border-[1.5px] border-outline bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: GUTTER_PX + 7 * MIN_COL_PX }}>
            {/* Day header */}
            <div className="flex border-b border-hairline bg-tile/60">
              <div style={{ width: GUTTER_PX }} className="shrink-0" />
              {view.days.map((day, i) => {
                const isToday = day === view.todayISO;
                return (
                  <div key={day} className="flex-1 min-w-0 px-2 py-2 text-center border-l border-hairline first:border-l-0">
                    <span
                      className={`text-[11px] font-heading font-semibold uppercase tracking-[0.1em] ${
                        isToday ? "text-orange" : "text-ink-3"
                      }`}
                    >
                      {DAY_NAMES[i]}
                    </span>{" "}
                    <span
                      className={`text-[13px] font-heading font-bold tabular-nums ${
                        isToday
                          ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange text-white"
                          : "text-ink-1"
                      }`}
                    >
                      {Number(day.slice(8, 10))}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* All-day strip */}
            {view.allDayEvents.length > 0 && (
              <div className="flex border-b border-hairline">
                <div
                  style={{ width: GUTTER_PX }}
                  className="shrink-0 flex items-center justify-end pr-2 text-[10px] text-ink-3"
                >
                  all day
                </div>
                {view.days.map((day) => (
                  <div key={day} className="flex-1 min-w-0 border-l border-hairline first:border-l-0 p-1 space-y-1">
                    {view.allDayEvents
                      .filter((e) => e.day === day)
                      .map((e) => (
                        <div
                          key={e.id}
                          className="truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-ink-2 bg-tile border border-hairline"
                          title={e.title}
                        >
                          {e.title}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}

            {/* Time grid */}
            <div className="flex">
              {/* Hour gutter */}
              <div style={{ width: GUTTER_PX, height: gridHeight }} className="shrink-0 relative">
                {hourMarks.map((m) => (
                  <span
                    key={m}
                    className="absolute right-2 -translate-y-1/2 text-[10px] text-ink-3 tabular-nums"
                    style={{ top: (m - gridStart) * PX_PER_MIN }}
                  >
                    {m % 1440 === 0
                      ? ""
                      : `${((Math.floor(m / 60) + 11) % 12) + 1}${Math.floor(m / 60) % 24 < 12 ? " AM" : " PM"}`}
                  </span>
                ))}
              </div>

              {/* Day columns */}
              <div ref={columnsRef} className="relative flex flex-1" style={{ height: gridHeight }}>
                {dayLayouts.map(({ day, items, placed }, dayIdx) => {
                  const isToday = day === view.todayISO;
                  return (
                    <div
                      key={day}
                      onPointerDown={beginCreate}
                      className={`relative flex-1 min-w-0 border-l border-hairline first:border-l-0 ${
                        isToday ? "bg-orange-light/25" : ""
                      } ${isSelf ? "cursor-crosshair" : ""}`}
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(to bottom, rgba(199,177,140,0.28) 0, rgba(199,177,140,0.28) 1px, transparent 1px, transparent 52px)",
                        backgroundPosition: `0 ${(60 - (gridStart % 60)) % 60 * PX_PER_MIN}px`,
                      }}
                    >
                      {/* Working-hours shading: outside hours sits slightly dimmed */}
                      <div
                        className="absolute inset-x-0 top-0 bg-ink-1/[0.03] pointer-events-none"
                        style={{ height: Math.max(0, (view.prefs.dayStartMinute - gridStart) * PX_PER_MIN) }}
                      />
                      <div
                        className="absolute inset-x-0 bottom-0 bg-ink-1/[0.03] pointer-events-none"
                        style={{ height: Math.max(0, (gridEnd - view.prefs.dayEndMinute) * PX_PER_MIN) }}
                      />

                      {/* Open gaps */}
                      {view.openGaps
                        .filter((g) => g.day === day && g.endMin - g.startMin >= 30)
                        .map((g, i) => (
                          <div
                            key={`gap-${i}`}
                            className="absolute left-1 right-1 rounded-md border border-dashed border-outline/70 flex items-start justify-center pointer-events-none"
                            style={{
                              top: (g.startMin - gridStart) * PX_PER_MIN + 1,
                              height: (g.endMin - g.startMin) * PX_PER_MIN - 2,
                            }}
                          >
                            <span className="mt-1 text-[9px] uppercase tracking-[0.08em] text-ink-3/80">
                              {formatDuration(g.endMin - g.startMin)} open
                            </span>
                          </div>
                        ))}

                      {/* Items */}
                      {items.map((item) => {
                        const p = placed.get(item) ?? { lane: 0, lanes: 1 };
                        const top = (Math.max(item.startMin, gridStart) - gridStart) * PX_PER_MIN;
                        const height = Math.max(
                          (Math.min(item.endMin, gridEnd) - Math.max(item.startMin, gridStart)) * PX_PER_MIN,
                          14
                        );
                        const laneStyle = {
                          top,
                          height,
                          left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                          width: `calc(${(1 / p.lanes) * 100}% - 4px)`,
                        };
                        if (item.kind === "event") {
                          const e = item.event;
                          return (
                            <div
                              key={`ev-${e.id}`}
                              onPointerDown={(ev) => ev.stopPropagation()}
                              className={`absolute rounded-md border bg-tile px-1.5 py-1 overflow-hidden shadow-tile cursor-default ${
                                e.isExternal ? "border-orange/40" : "border-hairline"
                              }`}
                              style={{
                                ...laneStyle,
                                borderLeftWidth: 3,
                                borderLeftColor: e.isExternal ? "#E8500A" : "#C7B18C",
                              }}
                              title={`${e.title}${e.location ? ` · ${e.location}` : ""}`}
                            >
                              <div className="text-[11px] font-medium text-ink-1 leading-tight truncate">
                                {e.title}
                              </div>
                              {height >= 34 && (
                                <div className="text-[10px] text-ink-3 tabular-nums truncate">
                                  {formatMinuteRange(item.startMin, item.endMin)}
                                </div>
                              )}
                              {height >= 52 && e.location && (
                                <div className="text-[10px] text-ink-3 truncate">{e.location}</div>
                              )}
                            </div>
                          );
                        }
                        const b = item.block;
                        const tasks = tasksByBlock.get(b.id) ?? [];
                        const done = tasks.filter((t) => t.status === "done").length;
                        return (
                          <div
                            key={`blk-${b.id}`}
                            onPointerDown={(ev) => beginBlockDrag(ev, b)}
                            className={`absolute rounded-md border bg-orange-light px-1.5 py-1 overflow-hidden shadow-tile select-none ${
                              selectedId === b.id ? "border-orange ring-1 ring-orange/50" : "border-orange/35"
                            } ${isSelf ? "cursor-grab active:cursor-grabbing" : ""}`}
                            style={{ ...laneStyle, borderLeftWidth: 3, borderLeftColor: "#E8500A" }}
                            title={b.synced ? b.title : `${b.title} · not on Google yet`}
                          >
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-heading font-semibold text-ink-1 leading-tight truncate">
                                {b.title}
                              </span>
                              {!b.synced && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full bg-status-watch shrink-0"
                                  title="Not on Google yet"
                                />
                              )}
                            </div>
                            {height >= 34 && (
                              <div className="text-[10px] text-orange-dark/80 tabular-nums truncate">
                                {formatMinuteRange(item.startMin, item.endMin)}
                                {tasks.length > 0 && ` · ${done}/${tasks.length}`}
                              </div>
                            )}
                            {height >= 62 && tasks.length > 0 && (
                              <ul className="mt-0.5 space-y-px">
                                {tasks.slice(0, Math.floor((height - 44) / 16)).map((t) => (
                                  <li
                                    key={t.linkId}
                                    className="flex items-center gap-1 text-[10px] leading-4 truncate"
                                  >
                                    <button
                                      onPointerDown={(ev) => ev.stopPropagation()}
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        if (isSelf) void apiToggleTask(t.taskId, t.status !== "done");
                                      }}
                                      disabled={!isSelf}
                                      aria-label={t.status === "done" ? "Mark not done" : "Mark done"}
                                      className={`w-3 h-3 rounded-full border shrink-0 flex items-center justify-center ${
                                        t.status === "done"
                                          ? "bg-status-healthy-bg border-status-healthy/40 text-status-healthy-text"
                                          : "border-outline hover:border-orange/70"
                                      }`}
                                    >
                                      {t.status === "done" && (
                                        <svg viewBox="0 0 16 16" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth="3">
                                          <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      )}
                                    </button>
                                    <span className={t.status === "done" ? "text-ink-3 line-through truncate" : "text-ink-2 truncate"}>
                                      {t.title}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {isSelf && (
                              <div className="absolute inset-x-0 bottom-0 h-[7px] cursor-ns-resize" />
                            )}
                          </div>
                        );
                      })}

                      {/* Drag preview for this column */}
                      {drag && drag.dayIdx === dayIdx && (
                        <div
                          className="absolute left-0.5 right-0.5 rounded-md border-2 border-dashed border-orange bg-orange/10 pointer-events-none z-20 flex items-start px-1.5 py-0.5"
                          style={{
                            top: (drag.startMin - gridStart) * PX_PER_MIN,
                            height:
                              (drag.kind === "move"
                                ? drag.len
                                : Math.max(drag.endMin - drag.startMin, SNAP_MIN)) * PX_PER_MIN,
                          }}
                        >
                          <span className="text-[10px] font-semibold text-orange tabular-nums">
                            {formatMinuteRange(
                              drag.startMin,
                              drag.kind === "move" ? drag.startMin + drag.len : drag.endMin
                            )}
                          </span>
                        </div>
                      )}

                      {/* Now line */}
                      {nowStamp?.day === day && nowStamp.min >= gridStart && nowStamp.min <= gridEnd && (
                        <div
                          className="absolute inset-x-0 pointer-events-none z-10"
                          style={{ top: (nowStamp.min - gridStart) * PX_PER_MIN }}
                        >
                          <div className="h-[1.5px] bg-orange" />
                          <div className="absolute -left-[3px] -top-[2.5px] w-[7px] h-[7px] rounded-full bg-orange" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer: freshness + hint */}
        <div className="flex items-center justify-between border-t border-hairline px-4 py-2">
          <span className={`text-[11px] ${freshness.stale ? "text-orange" : "text-ink-3"}`}>
            {freshness.text}
          </span>
          {isSelf && (
            <span className="hidden sm:block text-[11px] text-ink-3">
              Drag on empty space to draw a work block · click a block to fill it
            </span>
          )}
          <button
            onClick={async () => {
              setRefreshing(true);
              try {
                await fetch("/api/admin/agenda/sync", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
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

      {/* Block panel */}
      {selectedBlock && (
        <BlockPanel
          block={selectedBlock}
          tasks={tasksByBlock.get(selectedBlock.id) ?? []}
          openTasks={view.openTasks}
          projectNames={view.projectNames}
          readOnly={!isSelf}
          onClose={() => setSelectedId(null)}
          onRetitle={(title) => apiRetitleBlock(selectedBlock.id, title)}
          onDelete={() => apiDeleteBlock(selectedBlock.id)}
          onToggleTask={(taskId, done) => apiToggleTask(taskId, done)}
          onAddTask={(taskId) => apiAddTask(selectedBlock.id, taskId)}
          onRemoveTask={(taskId, linkId) => apiRemoveTask(selectedBlock.id, taskId, linkId)}
        />
      )}
    </div>
  );
}
