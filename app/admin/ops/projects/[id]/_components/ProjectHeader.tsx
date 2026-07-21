"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAssignees, withSelected } from "@/app/admin/_lib/useAssignees";
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
export type InitiativeOption = { id: string; label: string };

export default function ProjectHeader({
  project,
  initiatives = [],
}: {
  project: OpsProject;
  initiatives?: InitiativeOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [busy, setBusy] = useState(false);
  const assigneeOptions = useAssignees();

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
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
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
            className="font-display font-black uppercase tracking-tight text-ink-1 text-2xl sm:text-3xl bg-tile border border-orange/40 rounded-lg px-3 py-1 focus:outline-none flex-1 min-w-0"
          />
        ) : (
          <h1
            onClick={() => {
              setTitleDraft(project.title);
              setTitleEditing(true);
            }}
            className="font-display font-black uppercase tracking-tight text-ink-1 text-2xl sm:text-3xl leading-tight cursor-pointer hover:text-orange transition-colors flex-1 min-w-0"
            title="Click to edit"
          >
            {project.title}
          </h1>
        )}
        <button
          onClick={deleteProject}
          disabled={busy}
          className="shrink-0 text-xs text-expense hover:text-expense border border-expense/30 hover:border-expense/30 bg-expense-bg px-3 py-1.5 rounded-lg"
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
            className={`w-full bg-tile border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-orange/50 ${categoryBadgeClass(project.category)}`}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-ink text-ink-1">
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
            className={`w-full bg-tile border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-orange/50 ${projectStatusBadgeClass(project.status)}`}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-ink text-ink-1">
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
            className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1.5 text-sm text-ink-1 focus:outline-none focus:border-orange/50"
          >
            <option value="">Unassigned</option>
            {withSelected(assigneeOptions, project.assigned_to ?? "").map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </FieldGroup>

        <FieldGroup label="Due date">
          <input
            type="date"
            value={project.due_date ?? ""}
            onChange={(e) => patch({ due_date: e.target.value || null })}
            disabled={busy}
            className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1.5 text-sm text-ink-1 focus:outline-none focus:border-orange/50"
          />
        </FieldGroup>

        <FieldGroup label="Initiative">
          {initiatives.length === 0 ? (
            <div className="text-xs text-ink-2 py-1.5">No initiatives yet</div>
          ) : (
            <select
              value={project.initiative_id ?? ""}
              onChange={(e) => patch({ initiative_id: e.target.value || null })}
              disabled={busy}
              title="Attach this project to a strategic initiative so its task progress rolls up"
              className="w-full bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1.5 text-sm text-ink-1 focus:outline-none focus:border-orange/50"
            >
              <option value="">Not linked</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id} className="bg-ink text-ink-1">
                  {i.label}
                </option>
              ))}
            </select>
          )}
        </FieldGroup>

        <FieldGroup label="Created">
          <div className="text-sm text-ink-1 py-1.5">
            {new Date(project.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}{" "}
            by <span className="capitalize">{project.created_by}</span>
          </div>
        </FieldGroup>

        <FieldGroup label="Last touched">
          <div className="text-sm text-ink-1 py-1.5">
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
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
