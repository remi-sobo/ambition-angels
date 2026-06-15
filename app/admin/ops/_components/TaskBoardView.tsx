"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TaskEditModal from "@/app/admin/_components/TaskEditModal";
import { PriorityFlag } from "./TaskRow";
import {
  formatDueLabel,
  priorityLabel,
  todayISO,
  type OpsTask,
  type TaskStatus,
} from "../_types/ops";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

/**
 * Status board. Cards group by status; dragging a card to another column
 * PATCHes its status (the server handles the completed_at transition). Cards
 * open the shared TaskEditModal on click, keeping edit behaviour identical to
 * the list.
 */
export default function TaskBoardView({
  tasks,
  projectNames,
}: {
  tasks: OpsTask[];
  projectNames: Record<string, string>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [local, setLocal] = useState(tasks);
  useEffect(() => setLocal(tasks), [tasks]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<TaskStatus | null>(null);
  const [editing, setEditing] = useState<OpsTask | null>(null);

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, OpsTask[]> = {
      todo: [],
      in_progress: [],
      blocked: [],
      done: [],
    };
    for (const t of local) map[t.status]?.push(t);
    return map;
  }, [local]);

  async function moveTo(id: string, status: TaskStatus) {
    const task = local.find((t) => t.id === id);
    if (!task || task.status === status) return;
    setLocal((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const r = await fetch(`/api/admin/ops/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Status move failed:", e);
      alert("Couldn't move task. Reloading.");
      router.refresh();
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const items = byStatus[col.status];
          const isOver = hoverCol === col.status;
          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverCol(col.status);
              }}
              onDragLeave={() => setHoverCol((c) => (c === col.status ? null : c))}
              onDrop={() => {
                if (dragId) moveTo(dragId, col.status);
                setDragId(null);
                setHoverCol(null);
              }}
              className={`rounded-card border-[1.5px] p-3 min-h-[8rem] transition-colors ${
                isOver ? "border-orange/50 bg-orange/5" : "border-outline bg-black/30"
              }`}
            >
              <header className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-2">
                  {col.label}
                </h3>
                <span className="text-[11px] text-ink-3">{items.length}</span>
              </header>
              <div className="space-y-2">
                {items.map((t) => (
                  <BoardCard
                    key={t.id}
                    task={t}
                    projectName={t.project_id ? projectNames[t.project_id] ?? null : null}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setHoverCol(null);
                    }}
                    onOpen={() => setEditing(t)}
                  />
                ))}
                {items.length === 0 && (
                  <p className="text-[11px] text-ink-3 italic px-1 py-2">Nothing here.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {editing && <TaskEditModal task={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function BoardCard({
  task,
  projectName,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  task: OpsTask;
  projectName: string | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const isDone = task.status === "done";
  const isOverdue = !!task.due_date && !isDone && task.due_date < todayISO();
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="rounded-lg border-[1.5px] border-outline bg-surface shadow-panel p-2.5 cursor-grab active:cursor-grabbing hover:bg-[#EFE6D4] transition-colors"
    >
      <div className="flex items-start gap-1.5">
        {!isDone && (
          <span className="mt-0.5" title={`${priorityLabel(task.priority)} priority`}>
            <PriorityFlag priority={task.priority} />
          </span>
        )}
        <button
          type="button"
          onClick={onOpen}
          className={`flex-1 min-w-0 text-left text-sm transition-colors ${
            isDone ? "line-through text-ink-3 hover:text-ink-2" : "text-ink-1 hover:text-orange"
          }`}
          title="Click to edit"
        >
          {task.title}
        </button>
      </div>
      <div className="flex items-center gap-2 mt-2 pl-[1.125rem] flex-wrap">
        {projectName && task.project_id && (
          <Link
            href={`/admin/ops/projects/${task.project_id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-orange/80 hover:text-orange truncate max-w-[140px]"
          >
            #{projectName}
          </Link>
        )}
        {task.assigned_to && (
          <span
            className="inline-flex w-4 h-4 rounded-full bg-tile text-ink-1 items-center justify-center text-[9px] font-bold uppercase"
            title={`Assigned to ${task.assigned_to}`}
          >
            {task.assigned_to.charAt(0)}
          </span>
        )}
        {task.due_date && (
          <span
            className={`text-[11px] font-mono ${
              isOverdue ? "text-expense font-semibold" : "text-ink-2"
            }`}
          >
            {formatDueLabel(task.due_date)}
          </span>
        )}
      </div>
    </div>
  );
}
