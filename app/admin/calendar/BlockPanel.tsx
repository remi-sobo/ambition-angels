"use client";

import { useMemo, useState } from "react";
import { mondayOf } from "@/lib/admin/ops/week";
import {
  formatDuration,
  formatMinuteRange,
  type GridBlock,
  type GridBlockTask,
} from "@/lib/agenda/week-grid";
import type { PickerTask } from "@/lib/agenda/week-view";
import {
  formatDueLabel,
  priorityFlagClass,
  priorityRank,
} from "@/app/admin/ops/_types/ops";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The block sheet: what's in this block, and what should go in it. The
 * checklist completes tasks through the same PATCH as every other surface;
 * the picker below it surfaces the owner's open tasks — planned-this-week
 * first, then pinned, then priority, then due — with one-tap re-sorts and a
 * project filter. A task already living on another block moves here (one
 * home at a time), and the row says so before you tap.
 */

type SortMode = "smart" | "priority" | "due";

function dayLabel(dayISO: string): string {
  return new Date(dayISO + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function homeLabel(homeDay: string): string {
  return new Date(homeDay + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
  });
}

export default function BlockPanel({
  block,
  tasks,
  openTasks,
  projectNames,
  readOnly,
  onClose,
  onRetitle,
  onDelete,
  onToggleTask,
  onAddTask,
  onRemoveTask,
}: {
  block: GridBlock;
  tasks: GridBlockTask[];
  openTasks: PickerTask[];
  projectNames: Record<string, string>;
  readOnly: boolean;
  onClose: () => void;
  onRetitle: (title: string) => void;
  onDelete: () => void;
  onToggleTask: (taskId: string, done: boolean) => void;
  onAddTask: (taskId: string) => void;
  onRemoveTask: (taskId: string, linkId: string) => void;
}) {
  const [title, setTitle] = useState(block.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("smart");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [addingId, setAddingId] = useState<string | null>(null);

  const inBlock = new Set(tasks.map((t) => t.taskId));
  const blockWeek = mondayOf(block.day);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = openTasks.filter((t) => {
      if (inBlock.has(t.id)) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      if (projectFilter === "none" && t.projectId) return false;
      if (projectFilter !== "all" && projectFilter !== "none" && t.projectId !== projectFilter)
        return false;
      return true;
    });
    const dueKey = (t: PickerTask) => t.dueDate ?? "9999-12-31";
    const smartKey = (t: PickerTask): [number, number, number, string] => [
      t.plannedWeek === blockWeek ? 0 : 1,
      t.pinnedForThisWeek ? 0 : 1,
      priorityRank(t.priority),
      dueKey(t),
    ];
    return filtered.sort((a, b) => {
      if (sort === "priority") {
        return priorityRank(a.priority) - priorityRank(b.priority) || dueKey(a).localeCompare(dueKey(b));
      }
      if (sort === "due") {
        return dueKey(a).localeCompare(dueKey(b)) || priorityRank(a.priority) - priorityRank(b.priority);
      }
      const ka = smartKey(a);
      const kb = smartKey(b);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
      }
      return a.title.localeCompare(b.title);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTasks, query, sort, projectFilter, blockWeek, tasks]);

  const projectOptions = useMemo(() => {
    const ids = new Set(
      openTasks.map((t) => t.projectId).filter((x): x is string => !!x)
    );
    return Array.from(ids)
      .map((id) => ({ id, title: projectNames[id] ?? "Untitled project" }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [openTasks, projectNames]);

  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-ink-1/20" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 right-0 z-40 w-[400px] max-w-[94vw] bg-surface border-l-[1.5px] border-outline shadow-panel flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-hairline">
          <div className="flex items-start gap-2">
            <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-orange shrink-0" aria-hidden />
            {readOnly ? (
              <h2 className={`${TYPE.modalTitle} flex-1 min-w-0`}>{block.title}</h2>
            ) : (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title.trim() && title.trim() !== block.title) onRetitle(title.trim());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className={`${TYPE.modalTitle} flex-1 min-w-0 bg-transparent border-b border-transparent focus:border-outline focus:outline-none`}
                aria-label="Block title"
              />
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-7 h-7 rounded-lg text-ink-3 hover:text-ink-1 hover:bg-tile"
            >
              ×
            </button>
          </div>
          <p className={`${TYPE.metadata} mt-1.5 pl-[18px]`}>
            {dayLabel(block.day)} · {formatMinuteRange(block.startMin, block.endMin)} ·{" "}
            {formatDuration(block.endMin - block.startMin)}
            {!block.synced && (
              <span className="ml-2 inline-flex items-center gap-1 text-status-watch-text">
                <span className="w-1.5 h-1.5 rounded-full bg-status-watch" /> not on Google yet
              </span>
            )}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Checklist */}
          <div className="px-5 py-4">
            <h3 className={`${TYPE.sectionHeader} mb-2`}>
              In this block{tasks.length > 0 && ` · ${done}/${tasks.length}`}
            </h3>
            {tasks.length === 0 ? (
              <p className="text-sm text-ink-3 italic">
                Nothing yet. {readOnly ? "" : "Pull tasks in below."}
              </p>
            ) : (
              <ul className="space-y-1">
                {tasks.map((t) => (
                  <li
                    key={t.linkId}
                    className="group flex items-center gap-2.5 rounded-lg border border-hairline bg-tile/50 px-2.5 py-2"
                  >
                    <button
                      onClick={() => !readOnly && onToggleTask(t.taskId, t.status !== "done")}
                      disabled={readOnly}
                      aria-label={t.status === "done" ? "Mark not done" : "Mark done"}
                      className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        t.status === "done"
                          ? "bg-status-healthy-bg border-status-healthy/40 text-status-healthy-text"
                          : "border-outline hover:border-orange/70"
                      }`}
                    >
                      {t.status === "done" && (
                        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm truncate ${
                          t.status === "done" ? "text-ink-3 line-through" : "text-ink-1"
                        }`}
                      >
                        {t.title}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-ink-3">
                        <span className={`font-semibold uppercase ${priorityFlagClass(t.priority)}`}>
                          {t.priority}
                        </span>
                        {t.projectId && projectNames[t.projectId] && (
                          <span className="truncate">#{projectNames[t.projectId]}</span>
                        )}
                        {t.dueDate && <span className="tabular-nums">due {formatDueLabel(t.dueDate)}</span>}
                      </div>
                    </div>
                    {!readOnly && (
                      <button
                        onClick={() => onRemoveTask(t.taskId, t.linkId)}
                        aria-label="Remove from block"
                        title="Remove from block (keeps the task)"
                        className="shrink-0 w-6 h-6 rounded text-ink-3 opacity-0 group-hover:opacity-100 hover:text-expense hover:bg-tile"
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Fill the block */}
          {!readOnly && (
            <div className="px-5 py-4 border-t border-hairline">
              <h3 className={`${TYPE.sectionHeader} mb-2`}>Fill this block</h3>
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tasks…"
                  className="flex-1 min-w-0 text-sm rounded-lg border border-outline bg-tile text-ink-1 px-2.5 py-1.5 placeholder:text-ink-3 focus:outline-none focus:border-orange/60"
                />
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="shrink-0 text-[11px] rounded-lg border border-outline bg-tile text-ink-1 px-1.5 py-1.5 max-w-[130px]"
                  aria-label="Filter by project"
                >
                  <option value="all">All projects</option>
                  <option value="none">No project</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1 mb-3">
                {(
                  [
                    ["smart", "Smart"],
                    ["priority", "Priority"],
                    ["due", "Due"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setSort(mode)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                      sort === mode ? "bg-orange text-white" : "text-ink-2 hover:text-ink-1"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {candidates.length === 0 ? (
                <p className="text-sm text-ink-3 italic">No open tasks match.</p>
              ) : (
                <ul className="space-y-1">
                  {candidates.slice(0, 40).map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={async () => {
                          setAddingId(t.id);
                          try {
                            await onAddTask(t.id);
                          } finally {
                            setAddingId(null);
                          }
                        }}
                        disabled={addingId !== null}
                        className="w-full text-left flex items-center gap-2.5 rounded-lg border border-transparent hover:border-orange/40 hover:bg-orange-light/40 px-2.5 py-1.5 disabled:opacity-50 transition-colors"
                      >
                        <span
                          className="shrink-0 w-5 h-5 rounded-full border border-dashed border-outline flex items-center justify-center text-ink-3 text-xs"
                          aria-hidden
                        >
                          +
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-ink-1 truncate">{t.title}</span>
                          <span className="flex items-center gap-2 text-[10px] text-ink-3">
                            <span className={`font-semibold uppercase ${priorityFlagClass(t.priority)}`}>
                              {t.priority}
                            </span>
                            {t.projectId && projectNames[t.projectId] && (
                              <span className="truncate">#{projectNames[t.projectId]}</span>
                            )}
                            {t.dueDate && <span className="tabular-nums">due {formatDueLabel(t.dueDate)}</span>}
                          </span>
                        </span>
                        {t.homeDay && (
                          <span
                            className="shrink-0 text-[10px] font-semibold text-status-watch-text"
                            title="Already on another block — tapping moves it here"
                          >
                            {t.homeBlockId === block.id ? "" : `On ${homeLabel(t.homeDay)} →`}
                          </span>
                        )}
                        {addingId === t.id && <span className="shrink-0 text-[10px] text-ink-3">…</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!readOnly && (
          <div className="px-5 py-3 border-t border-hairline flex items-center justify-between">
            <button
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  setTimeout(() => setConfirmDelete(false), 3000);
                } else {
                  onDelete();
                }
              }}
              className={`text-[12px] font-semibold rounded-lg px-3 py-1.5 transition-colors ${
                confirmDelete
                  ? "bg-expense text-white"
                  : "text-expense hover:bg-expense-bg"
              }`}
            >
              {confirmDelete ? "Delete block + keep tasks?" : "Delete block"}
            </button>
            <span className="text-[10px] text-ink-3">Tasks are never deleted</span>
          </div>
        )}
      </aside>
    </>
  );
}
