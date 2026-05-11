"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CATEGORIES,
  PROJECT_STATUSES,
  categoryBadgeClass,
  categoryLabel,
  projectStatusBadgeClass,
  type OpsProject,
} from "../../../_types/ops";

/**
 * Project header with inline editing. Every field commits to a PATCH on
 * change (or on blur for the title). Created date is shown read-only.
 *
 * Delete button at the bottom uses window.confirm() per the spec's "no
 * fancy modal" guidance for v1.
 */
export default function ProjectHeader({ project }: { project: OpsProject }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ops/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Project patch failed:", e);
      alert("Couldn't save change. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject() {
    if (
      !confirm(
        `Delete project "${project.title}"?\n\nTasks tied to this project will be orphaned (kept, but un-linked).`
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ops/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      router.push("/admin/ops/projects");
      router.refresh();
    } catch (e) {
      console.error("Project delete failed:", e);
      alert("Couldn't delete project.");
      setBusy(false);
    }
  }

  function commitTitle() {
    setTitleEditing(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== project.title) {
      patch({ title: trimmed });
    } else {
      setTitleDraft(project.title);
    }
  }

  return (
    <section className="rounded-card border border-white/10 bg-black/30 p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        {titleEditing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setTitleDraft(project.title);
                setTitleEditing(false);
              }
            }}
            className="font-display font-black uppercase tracking-tight text-cream text-2xl sm:text-3xl bg-white/5 border border-orange/40 rounded-lg px-3 py-1 focus:outline-none flex-1 min-w-0"
          />
        ) : (
          <h1
            onClick={() => {
              setTitleDraft(project.title);
              setTitleEditing(true);
            }}
            className="font-display font-black uppercase tracking-tight text-cream text-2xl sm:text-3xl leading-tight cursor-pointer hover:text-orange transition-colors flex-1 min-w-0"
            title="Click to edit"
          >
            {project.title}
          </h1>
        )}
        <button
          onClick={deleteProject}
          disabled={busy}
          className="shrink-0 text-xs text-red-300 hover:text-red-200 border border-red-500/30 hover:border-red-500/50 bg-red-500/10 px-3 py-1.5 rounded-lg"
        >
          Delete
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
        <FieldGroup label="Category">
          <select
            value={project.category}
            onChange={(e) => patch({ category: e.target.value })}
            disabled={busy}
            className={`w-full bg-white/5 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-orange/50 ${categoryBadgeClass(project.category)}`}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-ink text-cream">
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </FieldGroup>

        <FieldGroup label="Status">
          <select
            value={project.status}
            onChange={(e) => patch({ status: e.target.value })}
            disabled={busy}
            className={`w-full bg-white/5 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-orange/50 ${projectStatusBadgeClass(project.status)}`}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-ink text-cream">
                {s}
              </option>
            ))}
          </select>
        </FieldGroup>

        <FieldGroup label="Assigned to">
          <select
            value={project.assigned_to ?? ""}
            onChange={(e) => patch({ assigned_to: e.target.value || null })}
            disabled={busy}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-cream focus:outline-none focus:border-orange/50"
          >
            <option value="">Unassigned</option>
            <option value="remi">Remi</option>
            <option value="shannon">Shannon</option>
          </select>
        </FieldGroup>

        <FieldGroup label="Due date">
          <input
            type="date"
            value={project.due_date ?? ""}
            onChange={(e) => patch({ due_date: e.target.value || null })}
            disabled={busy}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-cream focus:outline-none focus:border-orange/50"
          />
        </FieldGroup>

        <FieldGroup label="Created">
          <div className="text-sm text-cream/80 py-1.5">
            {new Date(project.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}{" "}
            by <span className="capitalize">{project.created_by}</span>
          </div>
        </FieldGroup>

        <FieldGroup label="Last touched">
          <div className="text-sm text-cream/80 py-1.5">
            {new Date(project.last_touched_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
        </FieldGroup>
      </div>
    </section>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-mid mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
