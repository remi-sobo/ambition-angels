"use client";

// A self-contained task panel that hangs off a CRM record (a partner org or
// a constituent/donor). Fetches the tasks linked to this entity, lets you
// add one, toggle it done, and jumps to the Ops hub. Backed by the existing
// ops_tasks system, so anything added here also shows up in Ops, Today, etc.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TASK_PRIORITIES, priorityFlagClass, taskHasAssignee, type OpsTask, type TaskPriority } from "../ops/_types/ops";
import { useTaskComplete } from "../_lib/useTaskComplete";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

const ASSIGNEES = [
  { value: "", label: "Unassigned" },
  { value: "remi", label: "Remi" },
  { value: "shannon", label: "Shannon" },
] as const;

export function EntityTasks({
  entityType,
  entityId,
  entityLabel,
  defaultCategory,
}: {
  // Any registry entity type the ops_tasks link CHECK accepts
  // (partner, constituent, cohort, student, grant, …).
  entityType: string;
  entityId: string;
  entityLabel: string;
  defaultCategory: string;
}) {
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // form
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState("");
  const [assigneeError, setAssigneeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      linked_entity_type: entityType,
      linked_entity_id: entityId,
      limit: "100",
    });
    const res = await fetch(`/api/admin/ops/tasks?${params}`);
    const j = await res.json().catch(() => ({}));
    setTasks(Array.isArray(j.tasks) ? j.tasks : []);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { void load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    // Category comes from the entity context (a real department today), so
    // this only fires if a call site ever passes a non-department category.
    if (!taskHasAssignee(assignee, defaultCategory)) {
      setAssigneeError("Every task needs an owner — pick a team member to assign this to.");
      return;
    }
    setAssigneeError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ops/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category: defaultCategory,
          priority,
          due_date: due || null,
          assigned_to: assignee || null,
          linked_entity_type: entityType,
          linked_entity_id: entityId,
          linked_label: entityLabel,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { alert(j.error ?? `HTTP ${res.status}`); return; }
      setTitle(""); setDue(""); setPriority("medium"); setAssignee("");
      setOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const { isLeaving, complete } = useTaskComplete();

  const runToggle = async (t: OpsTask, status: "todo" | "done") => {
    setBusy(true);
    try {
      await fetch(`/api/admin/ops/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  // Marking done plays the strike → collapse animation, then commits (the task
  // drops into the "completed" drawer). Un-checking commits immediately.
  const toggle = (t: OpsTask) => {
    if (t.status === "done") void runToggle(t, "todo");
    else complete(t.id, () => runToggle(t, "done"));
  };

  const openTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-heading font-bold text-ink-1 text-sm">
          Tasks {openTasks.length > 0 && <span className="text-ink-3 font-normal">· {openTasks.length} open</span>}
        </h2>
        <div className="flex items-center gap-2">
          <Link href="/admin/ops" className="text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors">Ops →</Link>
          <button onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors">
            {open ? "Close" : "+ Task"}
          </button>
        </div>
      </div>

      {open && (
        <form onSubmit={add} className="px-5 py-4 border-b border-outline bg-surface flex flex-wrap items-end gap-3">
          <label className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold flex flex-col gap-1 flex-1 min-w-[16rem]">
            Task
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`e.g. Follow up with ${entityLabel}`} className={inputCls + " w-full"} autoFocus />
          </label>
          <label className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold flex flex-col gap-1">
            Due
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls + " w-40"} />
          </label>
          <label className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold flex flex-col gap-1">
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={inputCls}>
              {TASK_PRIORITIES.map((p) => <option key={p} value={p} className="bg-surface capitalize">{p}</option>)}
            </select>
          </label>
          <label className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold flex flex-col gap-1">
            Owner
            <select value={assignee} onChange={(e) => { setAssignee(e.target.value); setAssigneeError(null); }} className={inputCls}>
              {ASSIGNEES.map((a) => <option key={a.value} value={a.value} className="bg-surface">{a.label}</option>)}
            </select>
          </label>
          <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full disabled:opacity-50">
            {busy ? "Adding…" : "Add task"}
          </button>
          {assigneeError && <p className="w-full text-expense text-xs">{assigneeError}</p>}
        </form>
      )}

      {loading ? (
        <p className="px-5 py-5 text-ink-3 text-sm">Loading tasks…</p>
      ) : openTasks.length === 0 && doneTasks.length === 0 ? (
        <p className="px-5 py-5 text-ink-2 text-sm">No tasks yet. Add one to track the next move with {entityLabel}.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {openTasks.map((t) => (
            <TaskLi key={t.id} t={t} today={today} busy={busy} leaving={isLeaving(t.id)} onToggle={() => toggle(t)} />
          ))}
          {doneTasks.length > 0 && (
            <li className="px-5 py-2">
              <button onClick={() => setShowDone((v) => !v)} className="text-[11px] font-semibold text-ink-3 hover:text-ink-1">
                {showDone ? "Hide" : "Show"} {doneTasks.length} completed
              </button>
            </li>
          )}
          {showDone && doneTasks.map((t) => (
            <TaskLi key={t.id} t={t} today={today} busy={busy} onToggle={() => toggle(t)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskLi({ t, today, busy, onToggle, leaving = false }: {
  t: OpsTask; today: string; busy: boolean; onToggle: () => void; leaving?: boolean;
}) {
  const done = t.status === "done";
  // While leaving, show the row as already-done (filled + struck) so the
  // strike-through reads before it collapses away.
  const showDone = done || leaving;
  const overdue = !done && !!t.due_date && t.due_date < today;
  return (
    <li className={`px-5 py-3 flex items-center gap-3 ${leaving ? "task-leaving" : ""}`}>
      <button
        onClick={onToggle}
        disabled={busy || leaving}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={`w-4 h-4 rounded-full border-[1.5px] flex-shrink-0 flex items-center justify-center transition-colors ${
          showDone ? "bg-revenue border-revenue" : "border-outline hover:border-orange"
        }`}
      >
        {showDone && <span className="block text-white text-[10px] leading-none">✓</span>}
      </button>
      <span className={`text-sm flex-1 min-w-0 truncate ${showDone ? "text-ink-3 line-through" : "text-ink-1"}`}>
        {t.title}
      </span>
      {!done && (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${priorityFlagClass(t.priority)}`}>
          {t.priority}
        </span>
      )}
      {t.due_date && (
        <span className={`text-[11px] tabular-nums ${overdue ? "text-expense font-semibold" : "text-ink-3"}`}>
          {overdue ? "overdue · " : ""}{t.due_date.slice(5)}
        </span>
      )}
      {t.assigned_to && (
        <span className="text-[10px] uppercase tracking-wider text-ink-3">{t.assigned_to}</span>
      )}
    </li>
  );
}
