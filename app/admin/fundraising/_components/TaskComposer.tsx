"use client";

// One drawer to turn a list view into action: create a linked follow-up task
// for one donor/prospect (row action) or a batch of them (bulk action).
// Tasks land in ops_tasks with an entity link, so they show up on the record's
// profile, the Tasks column, Ops, Today, and Needs You — same spine as
// EntityTasks, just launchable from the tables where segments live.

import { useState } from "react";
import { TASK_PRIORITIES, type TaskPriority } from "../../ops/_types/ops";
import { useAssignees, withSelected } from "../../_lib/useAssignees";
import { useAdminUser } from "../../_components/AdminUserContext";
import Drawer from "../../_components/ui/Drawer";
import Button from "../../_components/ui/Button";
import { TextField, SelectField, DateField } from "../../_components/ui/Field";

export type TaskTarget = { id: string; name: string };

export default function TaskComposer({
  targets,
  entityType,
  defaultTitle,
  onClose,
}: {
  targets: TaskTarget[];
  /** ops_tasks link vocabulary: 'constituent' for donors, 'fr_prospects' for the bench. */
  entityType: "constituent" | "fr_prospects";
  /** Prefill for the title, e.g. segment-aware ("Reengage — LYBUNT"). */
  defaultTitle?: string;
  /** Called with how many tasks were created (0 = cancelled). */
  onClose: (created: number) => void;
}) {
  const single = targets.length === 1;
  const [title, setTitle] = useState(
    defaultTitle ?? (single ? `Follow up with ${targets[0].name}` : "Follow up")
  );
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  // Default the owner to the signed-in person (their first-name handle).
  const me = useAdminUser();
  const [assignee, setAssignee] = useState<string>(me ?? "");
  const assigneeOptions = withSelected(useAssignees(), assignee);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Give the task a title.");
      return;
    }
    setSaving(true);
    let created = 0;
    const failed: string[] = [];
    for (const t of targets) {
      try {
        const res = await fetch("/api/admin/ops/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: single ? title.trim() : `${title.trim()} · ${t.name}`,
            category: "fundraising",
            priority,
            due_date: due || null,
            assigned_to: assignee || null,
            linked_entity_type: entityType,
            linked_entity_id: t.id,
            linked_label: t.name,
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        created += 1;
      } catch {
        failed.push(t.name);
      }
    }
    setSaving(false);
    if (failed.length > 0) {
      setError(
        `Created ${created} of ${targets.length}. Failed for ${failed.slice(0, 3).join(", ")}` +
          (failed.length > 3 ? ` and ${failed.length - 3} more` : "") +
          ". Try again for the rest."
      );
      return;
    }
    onClose(created);
  }

  // The kit Drawer (V4 P1): focus trap, Escape and scrim cancel (held while
  // creating), a phone sheet and a pinned footer.
  return (
    <Drawer
      open
      onClose={() => !saving && onClose(0)}
      title={single ? `Task for ${targets[0].name}` : `Task for ${targets.length} ${entityType === "constituent" ? "donors" : "prospects"}`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose(0)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="task-composer-form" loading={saving}>
            {saving ? "Creating…" : single ? "Add task" : `Add ${targets.length} tasks`}
          </Button>
        </>
      }
    >
      <form id="task-composer-form" onSubmit={submit} className="space-y-4">
        <TextField
          label="Task"
          required
          data-autofocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          hint={
            single
              ? undefined
              : `One task per person, name appended: “${title.trim() || "…"} · ${targets[0].name}”, …`
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <DateField label="Due" value={due} onChange={(e) => setDue(e.target.value)} />
          <SelectField
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
          />
          <SelectField
            label="Owner"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            options={assigneeOptions.map((a) => ({ value: a.value, label: a.label }))}
          />
        </div>

        {error && (
          <p role="alert" className="text-status-critical-text text-xs">
            {error}
          </p>
        )}
      </form>
    </Drawer>
  );
}
