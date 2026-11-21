"use client";

import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { useState, useTransition } from "react";
import { saveAction } from "@/lib/admin/saveAction";
import { DateField, SelectField, TextField } from "@/app/admin/_components/ui/Field";
import MoreActionsMenu from "@/app/admin/_components/ui/MoreActionsMenu";
import { TYPE } from "@/lib/admin/typeScale";
import { useAssignees, withSelected } from "@/app/admin/_lib/useAssignees";
import {
  CATEGORIES,
  PROJECT_STATUSES,
  categoryLabel,
  type OpsProject,
} from "../../../_types/ops";

/**
 * The project's Details panel (V4 Stage G: Detail archetype, a compact
 * context panel on the right). Every field is a labeled kit field and
 * commits through saveAction on change (on blur for the title). Delete
 * lives in ProjectMoreActions, the page header's More actions.
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
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [busy, setBusy] = useState(false);
  const assigneeOptions = useAssignees();

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    const r = await saveAction({
      request: { url: `/api/admin/ops/projects/${project.id}`, method: "PATCH", body },
      failure: "Couldn't save the change. Try again.",
      toast,
    });
    setBusy(false);
    if (r.ok) startTransition(() => router.refresh());
    else setTitleDraft(project.title);
  }

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== project.title) patch({ title: trimmed });
    else setTitleDraft(project.title);
  }

  const fmtDate = (iso: string, withTime = false) =>
    new Date(iso).toLocaleString("en-US", withTime ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { year: "numeric", month: "short", day: "numeric" });

  return (
    <section aria-labelledby="project-details" className="rounded-panel border border-hairline bg-surface p-5">
      <h2 id="project-details" className={`${TYPE.sectionHeader} mb-4`}>
        Details
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
        <TextField
          label="Title"
          controlSize="md"
          value={titleDraft}
          disabled={busy}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setTitleDraft(project.title);
          }}
        />
        <SelectField
          label="Status"
          controlSize="md"
          value={project.status}
          disabled={busy}
          onChange={(e) => patch({ status: e.target.value })}
          options={PROJECT_STATUSES.map((s) => ({ value: s, label: categoryLabel(s) }))}
        />
        <SelectField
          label="Category"
          controlSize="md"
          value={project.category}
          disabled={busy}
          onChange={(e) => patch({ category: e.target.value })}
          options={CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
        />
        <SelectField
          label="Owner"
          controlSize="md"
          value={project.assigned_to ?? ""}
          disabled={busy}
          onChange={(e) => patch({ assigned_to: e.target.value || null })}
          placeholder="Unassigned"
          options={withSelected(assigneeOptions, project.assigned_to ?? "")}
        />
        <DateField
          label="Due date"
          controlSize="md"
          value={project.due_date ?? ""}
          disabled={busy}
          onChange={(e) => patch({ due_date: e.target.value || null })}
        />
        {initiatives.length === 0 ? (
          <div>
            <div className={`${TYPE.bodyMuted} text-[13px] font-medium`}>Initiative</div>
            <p className={`${TYPE.metadata} mt-1`}>No strategic initiatives yet. Add them on the Strategic Plan.</p>
          </div>
        ) : (
          <SelectField
            label="Initiative"
            hint="Attach to a strategic initiative so task progress rolls up"
            controlSize="md"
            value={project.initiative_id ?? ""}
            disabled={busy}
            onChange={(e) => patch({ initiative_id: e.target.value || null })}
            placeholder="Not linked"
            options={initiatives.map((i) => ({ value: i.id, label: i.label }))}
          />
        )}
      </div>
      <dl className={`mt-4 pt-3 border-t border-hairline grid grid-cols-2 gap-2 ${TYPE.metadata}`}>
        <div>
          <dt>Created</dt>
          <dd className="text-ink-1">
            {fmtDate(project.created_at)} by <span className="capitalize">{project.created_by}</span>
          </dd>
        </div>
        <div>
          <dt>Last touched</dt>
          <dd className="text-ink-1">{fmtDate(project.last_touched_at, true)}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * The project page's "More actions" (V4 Stage G: delete moves out of the
 * header into the overflow menu, still behind the house confirm dialog).
 */
export function ProjectMoreActions({ project, listHref = "/admin/work/projects" }: { project: Pick<OpsProject, "id" | "title">; listHref?: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  async function deleteProject() {
    const ok = await confirm({
      title: `Delete project "${project.title}"?`,
      body: "Tasks tied to this project are kept, but un-linked.",
      confirmLabel: "Delete project",
      destructive: true,
    });
    if (!ok) return;
    const r = await saveAction({
      request: { url: `/api/admin/ops/projects/${project.id}`, method: "DELETE" },
      failure: "Couldn't delete the project. Try again.",
      success: "Project deleted",
      toast,
    });
    if (!r.ok) return;
    router.push(listHref);
    router.refresh();
  }

  return (
    <MoreActionsMenu
      items={[
        { label: "All projects", href: listHref },
        { label: "Delete project", danger: true, onSelect: deleteProject },
      ]}
    />
  );
}
