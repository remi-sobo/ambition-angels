"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminUser } from "@/lib/admin/auth";
import {
  CATEGORIES,
  categoryLabel,
  type Category,
} from "@/app/admin/ops/_types/ops";

/**
 * Quick-add modal. Mounted by QuickAddButton on click. Fetches the list
 * of active projects when it opens so the user can optionally tie the
 * new task to one. On success: closes, calls router.refresh() so the
 * current view picks up the new task.
 */

type ProjectOption = { id: string; title: string };

export default function QuickAddModal({
  currentUser,
  onClose,
}: {
  currentUser: AdminUser | null;
  onClose: () => void;
}) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [assignee, setAssignee] = useState<AdminUser | "">(currentUser ?? "");
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState("");
  const [pinToday, setPinToday] = useState(false);
  const [pinWeek, setPinWeek] = useState(false);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // Fetch active projects once the modal opens.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/ops/projects?status=active&limit=200")
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((data) => {
        if (cancelled) return;
        const list = (data?.projects ?? []) as Array<{ id: string; title: string }>;
        setProjects(list.map((p) => ({ id: p.id, title: p.title })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/ops/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
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
      setSuccess(true);
      router.refresh();
      // Briefly show success state, then close.
      setTimeout(onClose, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={() => !saving && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-card border border-white/10 bg-ink shadow-2xl"
      >
        <form onSubmit={submit} className="p-6 space-y-4">
          <h2 className="text-lg font-display font-bold uppercase tracking-tight text-cream">
            Quick add task
          </h2>

          <Field label="Title" required>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to happen?"
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream placeholder-gray-mid focus:outline-none focus:border-orange/50"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" required>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream focus:outline-none focus:border-orange/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Assigned to">
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value as AdminUser | "")}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream focus:outline-none focus:border-orange/50"
              >
                <option value="">Unassigned</option>
                <option value="remi">Remi</option>
                <option value="shannon">Shannon</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream focus:outline-none focus:border-orange/50"
              />
            </Field>
            <Field label="Project">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream focus:outline-none focus:border-orange/50"
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex items-center gap-5 text-sm text-cream/80 pt-1">
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

          {error && <p className="text-red-400 text-xs">{error}</p>}
          {success && !error && (
            <p className="text-emerald-400 text-xs">Task added.</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-sm text-cream/70 hover:text-cream px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? "Adding…" : "Add task"}
            </button>
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
      <div className="text-[10px] uppercase tracking-wider text-gray-mid mb-1">
        {label} {required && <span className="text-orange">*</span>}
      </div>
      {children}
    </label>
  );
}
