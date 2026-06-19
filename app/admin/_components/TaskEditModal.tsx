"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  TASK_CATEGORIES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  categoryLabel,
  priorityLabel,
  type TaskCategory,
  type OpsTask,
  type TaskStatus,
  type TaskPriority,
} from "@/app/admin/ops/_types/ops";

/**
 * Edit / delete modal for an existing task. Mirrors QuickAddModal's layout
 * and field set, plus:
 *
 *   - Status dropdown (Quick-Add always creates as 'todo')
 *   - Description textarea
 *   - Delete button (with browser confirm)
 *
 * Save sends a single PATCH with every editable field. The server-side
 * /api/admin/ops/tasks/[id] handler decides completed_at transitions
 * and touches the owning project's last_touched_at — we don't have to
 * orchestrate any of that here.
 */

type ProjectOption = { id: string; title: string };

export default function TaskEditModal({
  task,
  onClose,
}: {
  task: OpsTask;
  onClose: () => void;
}) {
  const router = useRouter();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  // `sys:`-prefixed labels are internal (e.g. the ingest dedupe key) — keep
  // them out of the editable field but preserve them on save.
  const [labels, setLabels] = useState(
    (task.labels ?? []).filter((l) => !l.startsWith("sys:")).join(", ")
  );
  const [assignee, setAssignee] = useState<"remi" | "shannon" | "">(
    task.assigned_to ?? ""
  );
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [pinToday, setPinToday] = useState(task.pinned_for_today);
  const [pinWeek, setPinWeek] = useState(task.pinned_for_this_week);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !deleting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving, deleting]);

  // Fetch the active project list (plus this task's current project even if
  // it's now paused/done/archived, so the dropdown can still show it).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/ops/projects?status=active&limit=200")
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then(async (data) => {
        if (cancelled) return;
        const list = (data?.projects ?? []) as Array<{ id: string; title: string }>;
        const out: ProjectOption[] = list.map((p) => ({ id: p.id, title: p.title }));

        // If task is in a project we didn't fetch (non-active), fetch it
        // separately so the dropdown can render the current selection.
        if (
          task.project_id &&
          !out.some((p) => p.id === task.project_id)
        ) {
          try {
            const r2 = await fetch(`/api/admin/ops/projects/${task.project_id}`);
            if (r2.ok) {
              const { project } = (await r2.json()) as {
                project: { id: string; title: string };
              };
              if (project) out.unshift(project);
            }
          } catch {
            // No-op: dropdown just won't show the current project name.
          }
        }
        setProjects(out);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [task.project_id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/ops/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description || null,
          category,
          status,
          priority,
          labels: [
            ...labels.split(",").map((l) => l.trim()).filter(Boolean),
            ...(task.labels ?? []).filter((l) => l.startsWith("sys:")),
          ],
          assigned_to: assignee || null,
          due_date: dueDate || null,
          project_id: projectId || null,
          pinned_for_today: pinToday,
          pinned_for_this_week: pinWeek,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/ops/tasks/${task.id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={() => !busy && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-card border-[1.5px] border-outline bg-ink shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <form onSubmit={submit} className="p-6 space-y-4">
          <h2 className="text-lg font-display font-bold uppercase tracking-tight text-ink-1">
            Edit task
          </h2>

          <Field label="Title" required>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Notes, context, links…"
              className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-sm text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" required>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel(p)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Labels">
              <input
                type="text"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                placeholder="comma, separated"
                className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Assigned to">
              <select
                value={assignee}
                onChange={(e) =>
                  setAssignee(e.target.value as "remi" | "shannon" | "")
                }
                className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
              >
                <option value="">Unassigned</option>
                <option value="remi">Remi</option>
                <option value="shannon">Shannon</option>
              </select>
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
              />
            </Field>
          </div>

          <Field label="Project">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-center gap-5 text-sm text-ink-1 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pinToday}
                onChange={(e) => setPinToday(e.target.checked)}
                className="accent-orange"
              />
              Pin for today
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pinWeek}
                onChange={(e) => setPinWeek(e.target.checked)}
                className="accent-orange"
              />
              Pin for this week
            </label>
          </div>

          {error && <p className="text-expense text-xs">{error}</p>}

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-hairline">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="text-xs text-expense hover:text-expense border border-expense/30 hover:border-expense/30 bg-expense-bg px-3 py-2 rounded-lg disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete task"}
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="text-sm text-ink-2 hover:text-ink-1 px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">
        {label} {required && <span className="text-orange">*</span>}
      </div>
      {children}
    </label>
  );
}
