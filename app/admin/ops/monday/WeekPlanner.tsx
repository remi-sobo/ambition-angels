"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  categoryBadgeClass,
  categoryLabel,
  formatDueLabel,
  type OpsTask,
} from "../_types/ops";

/**
 * Monday Plan, the day-by-day board (BloomOS weekly rhythm, Phase 2).
 *
 * Renders the seven days of the planning week, each with its real agenda
 * (read-only context, from calendar_events) alongside the tasks placed on that
 * day. Tasks can be placed on a day, moved between days, reordered within a day,
 * or marked done — all via PATCH against /api/admin/ops/tasks/[id], which keeps
 * planned_day / planned_week / day_order consistent.
 *
 * No Google write here: placing a task on a day is a planned_day write, not a
 * calendar event. The actual time-block write lands in Phase 4.
 */

export type PlannerEvent = {
  id: string;
  title: string;
  start: string; // ISO UTC
  end: string | null;
  allDay: boolean;
  isExternal: boolean;
  location: string | null;
};

export type PlannerDay = {
  iso: string;
  label: string;
  isToday: boolean;
  events: PlannerEvent[];
  tasks: OpsTask[]; // pre-sorted by day_order
};

const ORG_TZ = "America/Los_Angeles";

function eventTime(ev: PlannerEvent): string {
  if (ev.allDay) return "all day";
  return new Date(ev.start).toLocaleTimeString("en-US", {
    timeZone: ORG_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WeekPlanner({
  days,
  unscheduled,
  projectNames,
}: {
  days: PlannerDay[];
  unscheduled: OpsTask[];
  /** project_id → title, for the inline project chip. */
  projectNames: Record<string, string>;
}) {
  const projectName = (t: OpsTask) =>
    t.project_id ? projectNames[t.project_id] ?? null : null;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function runPatches(
    patches: Array<{ id: string; body: Record<string, unknown> }>
  ) {
    try {
      await Promise.all(
        patches.map((p) =>
          fetch(`/api/admin/ops/tasks/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p.body),
          }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
          })
        )
      );
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Planner patch failed:", e);
      alert("Couldn't save change. Try again.");
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      await runPatches([{ id, body }]);
    } finally {
      setBusyId(null);
    }
  }

  // Reorder within a day: renumber the day densely (day_order = position) so the
  // order is always 0..n-1, then persist only the rows whose order changed.
  async function reorder(tasks: OpsTask[], from: number, to: number) {
    if (to < 0 || to >= tasks.length || from === to) return;
    const next = tasks.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const patches = next
      .map((t, i) => ({ t, i }))
      .filter(({ t, i }) => t.day_order !== i)
      .map(({ t, i }) => ({ id: t.id, body: { day_order: i } }));
    if (patches.length === 0) return;
    setBusyId(moved.id);
    try {
      await runPatches(patches);
    } finally {
      setBusyId(null);
    }
  }

  const dayOptions = days.map((d) => ({ iso: d.iso, label: d.label }));

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-4">
        This Week, by day
      </h2>

      {unscheduled.length > 0 && (
        <div className="mb-6 rounded-lg border border-dashed border-outline bg-tile/40 p-4">
          <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
            Not yet on a day ({unscheduled.length})
          </h3>
          <div className="space-y-1.5">
            {unscheduled.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-outline bg-surface shadow-panel"
              >
                <DoneButton
                  task={t}
                  busy={busyId === t.id}
                  onClick={() => patch(t.id, { status: "done" })}
                />
                <TaskMeta task={t} projectName={projectName(t)} />
                <DayPicker
                  value={null}
                  options={dayOptions}
                  disabled={busyId === t.id}
                  placeholder="Place on…"
                  onPick={(iso) => patch(t.id, { planned_day: iso })}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {days.map((day) => (
          <div
            key={day.iso}
            className={`rounded-lg border p-4 ${
              day.isToday
                ? "border-orange/40 bg-orange-light/40"
                : "border-outline bg-surface"
            }`}
          >
            <h3
              className={`text-[11px] uppercase tracking-wider mb-2 ${
                day.isToday ? "text-orange font-semibold" : "text-ink-3"
              }`}
            >
              {day.label}
              {day.isToday && <span className="ml-2 text-orange">· today</span>}
            </h3>

            {day.events.length > 0 && (
              <div className="mb-3 space-y-1">
                {day.events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 text-[11px] text-ink-2 pl-1"
                    title={ev.location ?? undefined}
                  >
                    <span className="font-mono text-ink-3 w-16 shrink-0">
                      {eventTime(ev)}
                    </span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        ev.isExternal ? "bg-orange" : "bg-gray-mid"
                      }`}
                      aria-hidden
                    />
                    <span className="truncate">{ev.title}</span>
                  </div>
                ))}
              </div>
            )}

            {day.tasks.length === 0 && day.events.length === 0 ? (
              <p className="text-xs text-ink-3 italic">Nothing planned.</p>
            ) : (
              <div className="space-y-1.5">
                {day.tasks.map((t, i) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-outline bg-surface shadow-panel"
                  >
                    <div className="flex flex-col -my-1">
                      <ReorderArrow
                        dir="up"
                        disabled={i === 0 || busyId === t.id}
                        onClick={() => reorder(day.tasks, i, i - 1)}
                      />
                      <ReorderArrow
                        dir="down"
                        disabled={i === day.tasks.length - 1 || busyId === t.id}
                        onClick={() => reorder(day.tasks, i, i + 1)}
                      />
                    </div>
                    <DoneButton
                      task={t}
                      busy={busyId === t.id}
                      onClick={() => patch(t.id, { status: "done" })}
                    />
                    <TaskMeta task={t} projectName={projectName(t)} />
                    <DayPicker
                      value={day.iso}
                      options={dayOptions}
                      disabled={busyId === t.id}
                      onPick={(iso) => patch(t.id, { planned_day: iso })}
                    />
                    <button
                      onClick={() => patch(t.id, { planned_day: null })}
                      disabled={busyId === t.id}
                      aria-label="Remove from day"
                      title="Back to unscheduled"
                      className="shrink-0 w-6 h-6 rounded text-ink-3 hover:text-ink-1 hover:bg-[#EFE6D4] disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function DoneButton({
  task,
  busy,
  onClick,
}: {
  task: OpsTask;
  busy: boolean;
  onClick: () => void;
}) {
  const isDone = task.status === "done";
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={isDone ? "Mark as not done" : "Mark as done"}
      className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
        isDone
          ? "bg-revenue-bg border-revenue/30 text-revenue"
          : "border-outline hover:border-orange/60"
      }`}
    >
      {isDone && (
        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function TaskMeta({
  task,
  projectName,
}: {
  task: OpsTask;
  projectName?: string | null;
}) {
  return (
    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
      <span className="text-sm text-ink-1 truncate min-w-[100px]">{task.title}</span>
      <span
        className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(task.category)}`}
      >
        {categoryLabel(task.category)}
      </span>
      {task.project_id && projectName && (
        <span className="text-[11px] text-orange/80 truncate max-w-[140px]">
          #{projectName}
        </span>
      )}
      {task.due_date && (
        <span className="text-[11px] text-ink-2 font-mono">
          {formatDueLabel(task.due_date)}
        </span>
      )}
    </div>
  );
}

function DayPicker({
  value,
  options,
  disabled,
  placeholder,
  onPick,
}: {
  value: string | null;
  options: Array<{ iso: string; label: string }>;
  disabled: boolean;
  placeholder?: string;
  onPick: (iso: string) => void;
}) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
      className="shrink-0 text-[11px] rounded border border-outline bg-tile text-ink-1 px-1.5 py-1 disabled:opacity-40 max-w-[120px]"
      aria-label="Move to day"
    >
      {placeholder && value === null && (
        <option value="">{placeholder}</option>
      )}
      {options.map((o) => (
        <option key={o.iso} value={o.iso}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ReorderArrow({
  dir,
  disabled,
  onClick,
}: {
  dir: "up" | "down";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "up" ? "Move up" : "Move down"}
      className="w-4 h-3.5 flex items-center justify-center text-ink-3 hover:text-orange disabled:opacity-25 disabled:hover:text-ink-3"
    >
      <svg viewBox="0 0 12 8" className="w-2.5 h-2" fill="currentColor" aria-hidden>
        {dir === "up" ? (
          <path d="M6 0l6 8H0z" />
        ) : (
          <path d="M6 8L0 0h12z" />
        )}
      </svg>
    </button>
  );
}
