"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import TaskRow from "@/app/admin/ops/_components/TaskRow";
import {
  taskStatusBadgeClass,
  type OpsTask,
} from "@/app/admin/ops/_types/ops";

const STATUS_ORDER = ["todo", "in_progress", "blocked", "done"] as const;

function statusLabel(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Shannon's connection backlog — the scheduling tasks assigned to her,
 * grouped by status, in her display_order. This is NOT a second task store:
 * every row is a real ops_task (label 'scheduling', assigned_to 'shannon'),
 * so it reuses TaskRow wholesale — the checkbox (todo↔done), priority flag,
 * inline edit modal (priority / due / notes), pin, blocked toggle, delete, and
 * the constituent link chip all come for free and behave exactly as on the Ops
 * surface. Only the status grouping + drag-reorder are local, mirroring
 * TaskListView so the two stay consistent.
 */
export default function ConnectionsBacklog({
  connections,
}: {
  connections: OpsTask[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Server is the source of truth; resync whenever a refresh hands us a new
  // array (after edit / status change / reorder).
  const [local, setLocal] = useState(connections);
  useEffect(() => setLocal(connections), [connections]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Connections are flat (no subtasks); guard anyway by showing top-level only.
  const topLevel = useMemo(() => local.filter((t) => !t.parent_id), [local]);

  const groups = useMemo(() => {
    const byKey = new Map<string, OpsTask[]>();
    for (const t of topLevel) {
      const arr = byKey.get(t.status) ?? [];
      arr.push(t);
      byKey.set(t.status, arr);
    }
    return STATUS_ORDER.filter((k) => (byKey.get(k)?.length ?? 0) > 0).map(
      (k) => ({ key: k, items: byKey.get(k) ?? [] })
    );
  }, [topLevel]);

  // ── Reorder (within a status group only) ───────────────────────────────
  async function persist(nextTop: OpsTask[]) {
    const updates = nextTop
      .map((t, i) => ({ id: t.id, order: i + 1, old: t.display_order }))
      .filter((u) => u.order !== u.old);
    if (updates.length === 0) return;
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
      console.error("Connection reorder failed:", e);
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
    // Reorder only within the same status group; cross-group drags are a no-op.
    if (!src || !tgt || src.status !== tgt.status) return;

    const nextTop = [...topLevel];
    const from = nextTop.findIndex((t) => t.id === sourceId);
    const to = nextTop.findIndex((t) => t.id === targetId);
    const [moved] = nextTop.splice(from, 1);
    nextTop.splice(to, 0, moved);

    setLocal(nextTop.map((t, i) => ({ ...t, display_order: i + 1 })));
    persist(nextTop);
  }

  if (topLevel.length === 0) {
    return (
      <div className="rounded-lg border-[1.5px] border-outline bg-tile p-8 text-center">
        <p className="text-sm text-ink-2">No connections in the backlog yet.</p>
        <p className="mt-1 text-xs text-ink-3">
          Intros Remi sends with you on them show up as candidates to add, or
          create one manually with “+ New connection.”
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.key}>
          <header className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${taskStatusBadgeClass(
                  g.key
                )}`}
              >
                {statusLabel(g.key)}
              </span>
            </h3>
            <span className="text-[11px] text-ink-3">{g.items.length}</span>
          </header>
          <div className="space-y-1.5">
            {g.items.map((t) => {
              const isDragOver =
                hoverId === t.id && dragId !== null && dragId !== t.id;
              return (
                <div
                  key={t.id}
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
                  <div className="flex-1 min-w-0">
                    <TaskRow task={t} hideProjectLink />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
