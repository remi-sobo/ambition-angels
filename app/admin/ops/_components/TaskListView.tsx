"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/admin/auth";
import TaskRow, { PriorityFlag } from "./TaskRow";
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  categoryBadgeClass,
  categoryLabel,
  priorityLabel,
  taskStatusBadgeClass,
  type OpsTask,
  type TaskPriority,
} from "../_types/ops";

export type GroupBy = "priority" | "status" | "category" | "project";

const STATUS_ORDER = ["todo", "in_progress", "blocked", "done"] as const;

function statusLabel(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Unified List view. Top-level tasks (parent_id == null) are grouped by the
 * chosen dimension; subtasks render indented under their parent behind an
 * expand toggle. Reordering (display_order) is preserved via native drag
 * within a group. Pin/blocked/complete/delete all live on the reused TaskRow,
 * so those behaviours are unchanged.
 */
export default function TaskListView({
  tasks,
  projectNames,
  groupBy,
  currentUser,
}: {
  tasks: OpsTask[];
  projectNames: Record<string, string>;
  groupBy: GroupBy;
  currentUser: AdminUser | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Server is the source of truth; reset local order whenever a refresh
  // hands us a new array (after add / reorder / any mutation).
  const [local, setLocal] = useState(tasks);
  useEffect(() => setLocal(tasks), [tasks]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, OpsTask[]>();
    for (const t of local) {
      if (t.parent_id) {
        const list = map.get(t.parent_id) ?? [];
        list.push(t);
        map.set(t.parent_id, list);
      }
    }
    return map;
  }, [local]);

  const topLevel = useMemo(() => local.filter((t) => !t.parent_id), [local]);

  function groupKey(t: OpsTask): string {
    switch (groupBy) {
      case "priority":
        return t.priority;
      case "status":
        return t.status;
      case "category":
        return t.category;
      case "project":
        return t.project_id ?? "__none__";
    }
  }

  // Build ordered groups. Keys follow each dimension's canonical order;
  // unknown/extra keys (e.g. projects) fall to the end alphabetically.
  const groups = useMemo(() => {
    const byKey = new Map<string, OpsTask[]>();
    for (const t of topLevel) {
      const k = groupKey(t);
      const arr = byKey.get(k) ?? [];
      arr.push(t);
      byKey.set(k, arr);
    }
    let order: string[];
    if (groupBy === "priority") order = [...TASK_PRIORITIES];
    else if (groupBy === "status") order = [...STATUS_ORDER];
    else if (groupBy === "category") order = [...TASK_CATEGORIES];
    else {
      order = Array.from(byKey.keys()).sort((a, b) => {
        if (a === "__none__") return 1;
        if (b === "__none__") return -1;
        return (projectNames[a] ?? "").localeCompare(projectNames[b] ?? "");
      });
    }
    // Append any keys present in data but not in the canonical order.
    for (const k of Array.from(byKey.keys())) if (!order.includes(k)) order.push(k);
    return order
      .filter((k) => (byKey.get(k)?.length ?? 0) > 0)
      .map((k) => ({ key: k, items: byKey.get(k) ?? [] }));
  }, [topLevel, groupBy, projectNames]);

  // ── Reorder (within a group only) ──────────────────────────────────────
  async function persist(nextTop: OpsTask[]) {
    const updates = nextTop
      .map((t, i) => ({ id: t.id, order: i + 1, old: t.display_order }))
      .filter((u) => u.order !== u.old);
    setBusy(true);
    try {
      await Promise.all(
        updates.map((u) =>
          fetch(`/api/admin/ops/tasks/${u.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_order: u.order }),
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

  function onDrop(targetId: string) {
    const sourceId = dragId;
    setDragId(null);
    setHoverId(null);
    if (!sourceId || sourceId === targetId) return;
    const src = topLevel.find((t) => t.id === sourceId);
    const tgt = topLevel.find((t) => t.id === targetId);
    // Only reorder within the same group; cross-group moves are a no-op here.
    if (!src || !tgt || groupKey(src) !== groupKey(tgt)) return;

    const nextTop = [...topLevel];
    const from = nextTop.findIndex((t) => t.id === sourceId);
    const to = nextTop.findIndex((t) => t.id === targetId);
    const [moved] = nextTop.splice(from, 1);
    nextTop.splice(to, 0, moved);

    // Rebuild local: each parent (renumbered) followed by its children.
    const rebuilt: OpsTask[] = [];
    nextTop.forEach((p, i) => {
      rebuilt.push({ ...p, display_order: i + 1 });
      for (const c of childrenByParent.get(p.id) ?? []) rebuilt.push(c);
    });
    setLocal(rebuilt);
    persist(nextTop);
  }

  // ── Inline quick-add ────────────────────────────────────────────────────
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    setAddError(null);
    try {
      const r = await fetch("/api/admin/ops/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category: "other",
          priority: "medium",
          assigned_to: currentUser ?? null,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      setNewTitle("");
      startTransition(() => router.refresh());
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function projectName(t: OpsTask): string | null {
    return t.project_id ? projectNames[t.project_id] ?? null : null;
  }

  return (
    <div className="space-y-6">
      {groups.length === 0 ? (
        <p className="text-sm text-ink-2 italic">No tasks yet. Add one below.</p>
      ) : (
        groups.map((g) => (
          <div key={g.key}>
            <GroupHeader groupBy={groupBy} value={g.key} count={g.items.length} projectNames={projectNames} />
            <div className="space-y-1.5">
              {g.items.map((t) => {
                const kids = childrenByParent.get(t.id) ?? [];
                const isOpen = expanded.has(t.id);
                const isDragOver = hoverId === t.id && dragId !== null && dragId !== t.id;
                return (
                  <div key={t.id}>
                    <div
                      draggable={!busy}
                      onDragStart={() => setDragId(t.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setHoverId(t.id);
                      }}
                      onDrop={() => onDrop(t.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setHoverId(null);
                      }}
                      className={`flex items-center gap-1 rounded-lg ${
                        isDragOver ? "ring-2 ring-orange/40" : ""
                      }`}
                    >
                      <span
                        className="cursor-grab active:cursor-grabbing text-ink-3 hover:text-ink-1 select-none px-1 shrink-0"
                        title="Drag to reorder"
                        aria-label="Drag handle"
                      >
                        ⋮⋮
                      </span>
                      {kids.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleExpand(t.id)}
                          aria-label={isOpen ? "Collapse subtasks" : "Expand subtasks"}
                          className="shrink-0 w-5 h-5 flex items-center justify-center text-ink-2 hover:text-ink-1"
                        >
                          <svg
                            viewBox="0 0 16 16"
                            className={`w-3 h-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      ) : (
                        <span className="shrink-0 w-5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <TaskRow task={t} projectName={projectName(t)} />
                      </div>
                    </div>
                    {kids.length > 0 && !isOpen && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(t.id)}
                        className="ml-12 mt-0.5 text-[11px] text-ink-3 hover:text-ink-1"
                      >
                        {kids.length} subtask{kids.length === 1 ? "" : "s"}
                      </button>
                    )}
                    {kids.length > 0 && isOpen && (
                      <div className="ml-12 mt-1 space-y-1.5 border-l-[1.5px] border-hairline pl-3">
                        {kids.map((c) => (
                          <TaskRow key={c.id} task={c} projectName={projectName(c)} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <form onSubmit={addTask} className="flex items-center gap-2 pt-1">
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
      {addError && <p className="text-expense text-xs">{addError}</p>}
    </div>
  );
}

function GroupHeader({
  groupBy,
  value,
  count,
  projectNames,
}: {
  groupBy: GroupBy;
  value: string;
  count: number;
  projectNames: Record<string, string>;
}) {
  let label: React.ReactNode;
  if (groupBy === "priority") {
    label = (
      <span className="inline-flex items-center gap-1.5">
        <PriorityFlag priority={value as TaskPriority} />
        {priorityLabel(value)}
      </span>
    );
  } else if (groupBy === "status") {
    label = (
      <span
        className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${taskStatusBadgeClass(value)}`}
      >
        {statusLabel(value)}
      </span>
    );
  } else if (groupBy === "category") {
    label = (
      <span
        className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(value)}`}
      >
        {categoryLabel(value)}
      </span>
    );
  } else {
    label = (
      <span className="text-ink-1">
        {value === "__none__" ? "No project" : projectNames[value] ?? "Unknown project"}
      </span>
    );
  }
  return (
    <header className="flex items-center gap-2 mb-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-2">{label}</h3>
      <span className="text-[11px] text-ink-3">{count}</span>
    </header>
  );
}
