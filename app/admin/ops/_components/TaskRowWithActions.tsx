"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import TaskEditModal from "@/app/admin/_components/TaskEditModal";
import {
  categoryBadgeClass,
  categoryLabel,
  formatDueLabel,
  type OpsTask,
} from "../_types/ops";

/**
 * Variant of TaskRow with explicit inline action buttons.
 *
 * TaskRow (PR Ops-2) surfaces actions through a hover menu — great for
 * "just looking at tasks" surfaces (Today, This Week). The Monday/Friday
 * rituals are different: the user is making structured decisions, and
 * the action they're about to take should be one tap away, not hidden
 * behind a menu. Hence this variant.
 *
 * All actions are PATCH requests against /api/admin/ops/tasks/[id] with
 * a body the caller provides. No DELETE here (Monday/Friday don't have
 * a "delete this task" workflow — they have "unpin" and "mark done").
 */

export type TaskRowAction = {
  label: string;
  /** PATCH body sent to /api/admin/ops/tasks/[id]. */
  patch: Record<string, unknown>;
  /** Visual treatment. Defaults to "default". */
  variant?: "primary" | "danger" | "ghost" | "default";
};

const VARIANT_CLASSES: Record<NonNullable<TaskRowAction["variant"]>, string> = {
  primary:
    "bg-orange/15 text-orange border border-orange/30 hover:bg-orange/25",
  danger:
    "bg-expense-bg text-expense border border-expense/30 hover:bg-expense-bg",
  ghost:
    "text-ink-2 hover:text-ink-1 border border-transparent hover:bg-[#EFE6D4]",
  default:
    "bg-tile text-ink-1 border-[1.5px] border-outline hover:bg-[#EFE6D4]",
};

export default function TaskRowWithActions({
  task,
  projectName,
  actions = [],
  showCheckbox = true,
  showDueDate = true,
  showProject = true,
  readOnly = false,
  completedTimestamp,
}: {
  task: OpsTask;
  projectName?: string | null;
  actions?: TaskRowAction[];
  showCheckbox?: boolean;
  showDueDate?: boolean;
  showProject?: boolean;
  readOnly?: boolean;
  /** When set, shown in place of due_date (used on the Friday "shipped"
   *  list to display the completion time per row). */
  completedTimestamp?: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function applyPatch(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ops/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Task patch failed:", e);
      alert("Couldn't save change. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const isDone = task.status === "done";
  const isBlocked = task.status === "blocked";

  return (
    <>
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
        isDone
          ? "border-hairline bg-surface shadow-panel text-ink-3"
          : isBlocked
          ? "border-expense/30 bg-expense-bg"
          : "border-outline bg-surface shadow-panel hover:bg-[#EFE6D4]"
      }`}
    >
      {showCheckbox && !readOnly && (
        <button
          onClick={() => applyPatch({ status: isDone ? "todo" : "done" })}
          disabled={busy}
          aria-label={isDone ? "Mark as not done" : "Mark as done"}
          className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
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
      )}
      {showCheckbox && readOnly && (
        <span
          className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center ${
            isDone
              ? "bg-revenue-bg border-revenue/30 text-revenue"
              : "border-outline"
          }`}
          aria-label={isDone ? "Done" : "Not done"}
        >
          {isDone && (
            <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      )}

      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        {readOnly ? (
          <span
            className={`text-sm ${
              isDone ? "line-through text-ink-3" : "text-ink-1"
            } truncate min-w-[120px]`}
          >
            {task.title}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className={`text-sm text-left truncate min-w-[120px] transition-colors ${
              isDone
                ? "line-through text-ink-3 hover:text-ink-2"
                : "text-ink-1 hover:text-orange"
            }`}
            title="Click to edit"
          >
            {task.title}
          </button>
        )}
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(task.category)}`}
        >
          {categoryLabel(task.category)}
        </span>
        {task.assigned_to && (
          <span
            className="inline-flex w-4 h-4 rounded-full bg-tile text-ink-1 items-center justify-center text-[9px] font-bold uppercase"
            title={`Assigned to ${task.assigned_to}`}
          >
            {task.assigned_to.charAt(0)}
          </span>
        )}
        {showProject && task.project_id && projectName && (
          <Link
            href={`/admin/ops/projects/${task.project_id}`}
            className="text-[11px] text-orange/80 hover:text-orange truncate max-w-[140px]"
          >
            #{projectName}
          </Link>
        )}
        {isBlocked && (
          <span className="text-[10px] uppercase tracking-wider text-expense font-semibold">
            blocked
          </span>
        )}
      </div>

      {showDueDate && task.due_date && !completedTimestamp && (
        <span className="shrink-0 text-xs text-ink-2 font-mono">
          {formatDueLabel(task.due_date)}
        </span>
      )}
      {completedTimestamp && (
        <span className="shrink-0 text-xs text-revenue/80 font-mono">
          {new Date(completedTimestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      )}

      {!readOnly && actions.length > 0 && (
        <div className="shrink-0 flex items-center gap-1.5">
          {actions.map((a, i) => (
            <button
              key={`${a.label}-${i}`}
              onClick={() => applyPatch(a.patch)}
              disabled={busy}
              className={`text-[11px] font-medium px-2.5 py-1 rounded transition-colors disabled:opacity-50 ${
                VARIANT_CLASSES[a.variant ?? "default"]
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
    {editOpen && !readOnly && (
      <TaskEditModal task={task} onClose={() => setEditOpen(false)} />
    )}
    </>
  );
}
