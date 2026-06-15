"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import TaskEditModal from "@/app/admin/_components/TaskEditModal";
import {
  formatDueLabel,
  isTaskCategory,
  type AdminUserId,
  type Category,
  type OpsTask,
} from "../../../_types/ops";

/**
 * Ordered task list for a project, with native HTML5 drag-and-drop for
 * reordering (spec said: skip @dnd-kit; use native DnD; pick simplicity
 * over polish here). On drop we renumber every task's display_order
 * (1..N) and fire N PATCH requests in parallel — fine for ~10s of tasks
 * per project.
 *
 * Inline "Add task" form lives at the bottom of the list. Submitting
 * creates a task that inherits the project's category and the project's
 * assignee as a default.
 */
export default function ProjectTaskList({
  projectId,
  projectCategory,
  projectAssignedTo,
  initialTasks,
}: {
  projectId: string;
  projectCategory: Category;
  projectAssignedTo: AdminUserId | null;
  initialTasks: OpsTask[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tasks, setTasks] = useState(initialTasks);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingTask, setEditingTask] = useState<OpsTask | null>(null);

  // ── Add task ───────────────────────────────────────────────────────────
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/ops/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Projects accept a wider category set than tasks; fall back to
          // "other" when the project's category isn't a valid task category.
          title,
          category: isTaskCategory(projectCategory) ? projectCategory : "other",
          project_id: projectId,
          assigned_to: projectAssignedTo,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      setNewTitle("");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  // ── Reorder ────────────────────────────────────────────────────────────

  async function persistOrder(newTasks: OpsTask[]) {
    setBusy(true);
    try {
      // Renumber 1..N, PATCH each task whose display_order changed.
      const updates = newTasks
        .map((t, idx) => ({ id: t.id, newOrder: idx + 1, oldOrder: t.display_order }))
        .filter((u) => u.newOrder !== u.oldOrder);
      await Promise.all(
        updates.map((u) =>
          fetch(`/api/admin/ops/tasks/${u.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_order: u.newOrder }),
          })
        )
      );
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Reorder failed:", e);
      alert("Couldn't save new order. Reloading.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function onDragStart(idx: number) {
    setDragIndex(idx);
  }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setHoverIndex(idx);
  }
  function onDrop(idx: number) {
    if (dragIndex === null || dragIndex === idx) {
      setDragIndex(null);
      setHoverIndex(null);
      return;
    }
    const next = [...tasks];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    setTasks(next);
    setDragIndex(null);
    setHoverIndex(null);
    persistOrder(next);
  }
  function onDragEnd() {
    setDragIndex(null);
    setHoverIndex(null);
  }

  // ── Task mutations (used by the local rows) ─────────────────────────────

  async function patchTask(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ops/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Task patch failed:", e);
      alert("Couldn't save change.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(id: string, title: string) {
    if (!confirm(`Delete task "${title}"?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ops/tasks/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Task delete failed:", e);
      alert("Couldn't delete task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <section className="rounded-card border-[1.5px] border-outline bg-black/30 p-6">
      <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-4">
        Tasks{" "}
        <span className="text-ink-3">
          ({tasks.length}{tasks.length > 0 ? `, ${tasks.filter((t) => t.status !== "done").length} open` : ""})
        </span>
      </h2>

      {tasks.length === 0 ? (
        <p className="text-sm text-ink-2 italic mb-4">
          No tasks yet. Add the first one below.
        </p>
      ) : (
        <ul className="space-y-1.5 mb-5">
          {tasks.map((t, idx) => {
            const isDone = t.status === "done";
            const isBlocked = t.status === "blocked";
            const isDragOver = hoverIndex === idx && dragIndex !== null && dragIndex !== idx;
            return (
              <li
                key={t.id}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDrop={() => onDrop(idx)}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  isDragOver
                    ? "border-orange/50 bg-orange/5"
                    : isDone
                    ? "border-hairline bg-surface shadow-panel text-ink-3"
                    : isBlocked
                    ? "border-expense/30 bg-expense-bg"
                    : "border-outline bg-surface shadow-panel hover:bg-[#EFE6D4]"
                }`}
              >
                <span
                  className="cursor-grab active:cursor-grabbing text-ink-2 hover:text-ink-1 select-none px-1"
                  title="Drag to reorder"
                  aria-label="Drag handle"
                >
                  ⋮⋮
                </span>
                <button
                  onClick={() => patchTask(t.id, { status: isDone ? "todo" : "done" })}
                  disabled={busy}
                  aria-label={isDone ? "Mark as not done" : "Mark as done"}
                  className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center ${
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
                <button
                  type="button"
                  onClick={() => setEditingTask(t)}
                  className={`flex-1 min-w-0 truncate text-left transition-colors ${
                    isDone
                      ? "line-through text-ink-3 hover:text-ink-2"
                      : "text-ink-1 hover:text-orange"
                  }`}
                  title="Click to edit"
                >
                  {t.title}
                </button>
                {t.assigned_to && (
                  <span
                    className="inline-flex w-4 h-4 rounded-full bg-tile text-ink-1 items-center justify-center text-[9px] font-bold uppercase"
                    title={`Assigned to ${t.assigned_to}`}
                  >
                    {t.assigned_to.charAt(0)}
                  </span>
                )}
                {t.due_date && (
                  <span className="text-[11px] text-ink-2 font-mono">
                    {formatDueLabel(t.due_date)}
                  </span>
                )}
                <button
                  onClick={() => deleteTask(t.id, t.title)}
                  disabled={busy}
                  aria-label="Delete task"
                  className="text-ink-3 hover:text-expense text-xs px-1"
                  title="Delete task"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={addTask} className="flex items-center gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task (Enter to create)…"
          disabled={adding}
          className="flex-1 bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-sm text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50"
        />
        <button
          type="submit"
          disabled={adding || !newTitle.trim()}
          className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p className="text-expense text-xs mt-2">{error}</p>}
    </section>
    {editingTask && (
      <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} />
    )}
    </>
  );
}
