"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import TaskEditModal from "@/app/admin/_components/TaskEditModal";
import {
  categoryBadgeClass,
  categoryLabel,
  formatDueLabel,
  priorityFlagClass,
  priorityLabel,
  todayISO,
  type OpsTask,
} from "../_types/ops";

/** Small filled flag used as the priority indicator. */
export function PriorityFlag({ priority }: { priority: OpsTask["priority"] }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`w-3 h-3 shrink-0 ${priorityFlagClass(priority)}`}
      fill="currentColor"
      aria-hidden
    >
      <path d="M4 1.5a.75.75 0 0 1 .75.75V3h7.1c.6 0 .92.71.53 1.16L10.3 6.5l2.18 2.34c.4.45.07 1.16-.53 1.16H4.75v4.25a.75.75 0 0 1-1.5 0V2.25A.75.75 0 0 1 4 1.5Z" />
    </svg>
  );
}

/**
 * Reusable task row used in Today, This Week, and project task lists.
 * Renders with inline actions: checkbox toggles status to/from done, and a
 * small action menu exposes pin toggles, blocked toggle, and delete.
 *
 * Server callers pass the project name explicitly (we don't want every
 * Task list to do an N+1 lookup). When there's no project, projectName
 * is null and the row just doesn't render a project link.
 */
export default function TaskRow({
  task,
  projectName,
  hideProjectLink = false,
  leaving = false,
  onToggleDone,
}: {
  task: OpsTask;
  projectName?: string | null;
  hideProjectLink?: boolean;
  /** When true, the row plays the "completing" collapse animation (the parent
   *  owns the state + removes it after). */
  leaving?: boolean;
  /** Overrides the built-in done toggle so the parent can animate + commit. */
  onToggleDone?: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ops/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Task patch failed:", e);
      alert("Couldn't save change. Try again.");
    } finally {
      setBusy(false);
      setShowMenu(false);
    }
  }

  async function deleteTask() {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ops/tasks/${task.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Task delete failed:", e);
      alert("Couldn't delete task.");
    } finally {
      setBusy(false);
    }
  }

  const isDone = task.status === "done";
  const isBlocked = task.status === "blocked";
  const isOverdue = !!task.due_date && !isDone && task.due_date < todayISO();
  // While leaving, show the row as done (struck through) before it collapses.
  const showDone = isDone || leaving;

  function toggleDone() {
    patch({ status: isDone ? "todo" : "done" });
  }

  return (
    <>
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
        leaving ? "task-leaving " : ""
      }${
        showDone
          ? "border-hairline bg-surface shadow-panel text-ink-3"
          : isBlocked
          ? "border-expense/30 bg-expense-bg hover:bg-expense-bg"
          : "border-outline bg-surface shadow-panel hover:bg-[#EFE6D4]"
      }`}
    >
      <button
        onClick={onToggleDone ?? toggleDone}
        disabled={busy || leaving}
        aria-label={isDone ? "Mark as not done" : "Mark as done"}
        className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
          showDone
            ? "bg-revenue-bg border-revenue/30 text-revenue"
            : "border-outline hover:border-orange/60"
        }`}
      >
        {showDone && (
          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        {!showDone && (
          <span title={`${priorityLabel(task.priority)} priority`}>
            <PriorityFlag priority={task.priority} />
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className={`text-sm text-left truncate min-w-[120px] transition-colors ${
            showDone
              ? "line-through text-ink-3 hover:text-ink-2"
              : "text-ink-1 hover:text-orange"
          }`}
          title="Click to edit"
        >
          {task.title}
        </button>
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(task.category)}`}
        >
          {categoryLabel(task.category)}
        </span>
        {(task.labels ?? []).map((label) => (
          <span
            key={label}
            className="inline-block px-1.5 py-0.5 rounded text-[10px] tracking-wide font-medium border bg-tile text-ink-2 border-outline"
          >
            {label}
          </span>
        ))}
        {task.assigned_to && (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-ink-2"
            title={`Assigned to ${task.assigned_to}`}
          >
            <span className="inline-flex w-4 h-4 rounded-full bg-tile text-ink-1 items-center justify-center text-[9px] font-bold uppercase">
              {task.assigned_to.charAt(0)}
            </span>
          </span>
        )}
        {task.project_id && projectName && !hideProjectLink && (
          <Link
            href={`/admin/ops/projects/${task.project_id}`}
            className="text-[11px] text-orange/80 hover:text-orange truncate max-w-[140px]"
          >
            #{projectName}
          </Link>
        )}
        {task.linked_entity_type && task.linked_entity_id && (
          <Link
            href={
              task.linked_entity_type === "partner"
                ? `/admin/partners/${task.linked_entity_id}`
                : `/admin/fundraising/donors/${task.linked_entity_id}`
            }
            className="inline-flex items-center gap-1 text-[11px] text-ink-2 hover:text-orange bg-tile border border-outline rounded-full px-2 py-0.5 truncate max-w-[180px] transition-colors"
            title={`${task.linked_entity_type === "partner" ? "Partner" : "Donor"}: ${task.linked_label ?? ""}`}
          >
            <span className="text-ink-3">{task.linked_entity_type === "partner" ? "◆" : "♥"}</span>
            {task.linked_label ?? (task.linked_entity_type === "partner" ? "Partner" : "Donor")}
          </Link>
        )}
        {isBlocked && (
          <span className="text-[10px] uppercase tracking-wider text-expense font-semibold">
            blocked
          </span>
        )}
      </div>

      {task.due_date && (
        <span
          className={`shrink-0 text-xs font-mono ${
            isOverdue ? "text-expense font-semibold" : "text-ink-2"
          }`}
          title={isOverdue ? "Past due" : undefined}
        >
          {formatDueLabel(task.due_date)}
        </span>
      )}

      <div className="relative shrink-0">
        <button
          onClick={() => setShowMenu((v) => !v)}
          disabled={busy}
          aria-label="Task actions"
          className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded hover:bg-[#EFE6D4] text-ink-2 hover:text-ink-1 flex items-center justify-center"
        >
          ⋯
        </button>
        {showMenu && (
          <div
            className="absolute right-0 top-7 z-20 w-48 rounded-lg border-[1.5px] border-outline bg-ink shadow-xl py-1 text-xs"
            onMouseLeave={() => setShowMenu(false)}
          >
            <ActionItem
              onClick={() =>
                patch({ pinned_for_today: !task.pinned_for_today })
              }
              label={task.pinned_for_today ? "Unpin from today" : "Pin for today"}
            />
            <ActionItem
              onClick={() =>
                patch({ pinned_for_this_week: !task.pinned_for_this_week })
              }
              label={
                task.pinned_for_this_week ? "Unpin from week" : "Pin for week"
              }
            />
            <ActionItem
              onClick={() =>
                patch({ status: isBlocked ? "todo" : "blocked" })
              }
              label={isBlocked ? "Unblock" : "Mark blocked"}
            />
            <ActionItem
              onClick={() => patch({ archived_at: task.archived_at ? null : new Date().toISOString() })}
              label={task.archived_at ? "Unarchive" : "Archive"}
            />
            <div className="border-t border-outline my-1" />
            <ActionItem onClick={deleteTask} label="Delete" danger />
          </div>
        )}
      </div>
    </div>
    {editOpen && (
      <TaskEditModal task={task} onClose={() => setEditOpen(false)} />
    )}
    </>
  );
}

function ActionItem({
  onClick,
  label,
  danger,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-3 py-1.5 hover:bg-[#EFE6D4] ${
        danger ? "text-expense hover:text-expense" : "text-ink-1 hover:text-ink-1"
      }`}
    >
      {label}
    </button>
  );
}
