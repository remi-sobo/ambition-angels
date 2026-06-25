"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  CATEGORIES,
  PROJECT_STATUSES,
  categoryLabel,
  type Category,
} from "../_types/ops";

/**
 * Filter chips + search + "New project" button for the projects list.
 *
 * Filters live in the URL search params (so a filtered view is shareable
 * and survives reload). Local state mirrors the search input for typing
 * responsiveness; everything else is URL-immediate.
 *
 * "New project" opens a modal local to this component so we don't need an
 * extra file for that single piece of UI.
 */
export default function ProjectListControls({
  status,
  category,
  assignee,
  q,
  currentUser,
  showGrants,
}: {
  status: string;
  category: string;
  assignee: string;
  q: string;
  currentUser: "remi" | "shannon" | null;
  showGrants: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [localQ, setLocalQ] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => setLocalQ(q), [q]);

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams();
    const current: Record<string, string> = {};
    if (status) current.status = status;
    if (category) current.category = category;
    if (assignee) current.assignee = assignee;
    if (q) current.q = q;
    if (showGrants) current.grants = "show";
    const merged = { ...current, ...updates };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== null && v !== "") params.set(k, v);
    }
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `/admin/ops/projects?${qs}` : "/admin/ops/projects");
    });
  }

  function onSearch(value: string) {
    setLocalQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushParams({ q: value || null }), 250);
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <input
          type="search"
          value={localQ}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search projects…"
          className="flex-1 min-w-[200px] bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50"
        />
        <select
          value={status}
          onChange={(e) => pushParams({ status: e.target.value || null, page: null })}
          className="bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
        >
          <option value="active">Active</option>
          {PROJECT_STATUSES.filter((s) => s !== "active").map((s) => (
            <option key={s} value={s}>
              {categoryLabel(s)}
            </option>
          ))}
          <option value="">All statuses</option>
        </select>
        <select
          value={category}
          onChange={(e) => pushParams({ category: e.target.value || null, page: null })}
          className="bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <select
          value={assignee}
          onChange={(e) => pushParams({ assignee: e.target.value || null, page: null })}
          className="bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
        >
          <option value="">All assignees</option>
          <option value="me">Me ({currentUser ?? "remi"})</option>
          <option value="remi">Remi</option>
          <option value="shannon">Shannon</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <label className="flex items-center gap-2 text-ink-2 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={showGrants}
            onChange={(e) =>
              pushParams({ grants: e.target.checked ? "show" : null, page: null })
            }
            className="accent-orange w-4 h-4"
          />
          Show grant projects
        </label>
        <button
          onClick={() => setOpen(true)}
          className="ml-auto bg-orange hover:bg-orange-dark text-white text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap"
        >
          + New project
        </button>
      </div>

      {open && <NewProjectModal onClose={() => setOpen(false)} currentUser={currentUser} />}
    </>
  );
}

function NewProjectModal({
  onClose,
  currentUser,
}: {
  onClose: () => void;
  currentUser: "remi" | "shannon" | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [assignee, setAssignee] = useState<"remi" | "shannon" | "">(currentUser ?? "");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/ops/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          assigned_to: assignee || null,
          due_date: dueDate || null,
          description: description || null,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as { project: { id: string } };
      onClose();
      router.push(`/admin/ops/projects/${data.project.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-card border-[1.5px] border-outline bg-ink shadow-2xl"
      >
        <form onSubmit={submit} className="p-6 space-y-4">
          <h2 className="text-lg font-display font-bold uppercase tracking-tight text-ink-1">
            New Project
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

          <Field label="Category" required>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 focus:outline-none focus:border-orange/50"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </Field>

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

          <Field label="Description (markdown ok)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-sm text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50"
            />
          </Field>

          {error && <p className="text-expense text-xs">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-ink-2 hover:text-ink-1 px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? "Creating…" : "Create project"}
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
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">
        {label} {required && <span className="text-orange">*</span>}
      </div>
      {children}
    </label>
  );
}
