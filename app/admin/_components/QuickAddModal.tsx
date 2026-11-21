"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import type { AdminUser } from "@/lib/admin/auth";
import {
  ASSIGNEE_REQUIRED_MESSAGE,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  categoryLabel,
  priorityLabel,
  taskHasAssignee,
  type TaskCategory,
  type TaskPriority,
} from "@/app/admin/ops/_types/ops";
import { useAssignees, withSelected } from "../_lib/useAssignees";
import Drawer from "./ui/Drawer";
import Button from "./ui/Button";
import { TextField, SelectField, DateField, CheckboxField } from "./ui/Field";
import { useSaveAction } from "../_lib/useSaveAction";

/**
 * Quick-add drawer (kit Drawer, V4 P1). Mounted by QuickAddButton on click. Fetches the list
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
  const save = useSaveAction();
  const formId = `quick-add-${useId().replace(/:/g, "")}`;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>("other");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState<AdminUser | "">(currentUser ?? "");
  const assigneeOptions = withSelected(useAssignees(), assignee);
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState("");
  const [pinToday, setPinToday] = useState(false);
  const [pinWeek, setPinWeek] = useState(false);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
    if (!taskHasAssignee(assignee, category)) {
      setAssigneeError(ASSIGNEE_REQUIRED_MESSAGE);
      return;
    }
    setSaving(true);
    const r = await save({
      request: {
        url: "/api/admin/ops/tasks",
        method: "POST",
        body: {
          title: title.trim(),
          category,
          priority,
          assigned_to: assignee || null,
          due_date: dueDate || null,
          project_id: projectId || null,
          pinned_for_today: pinToday,
          pinned_for_this_week: pinWeek,
        },
      },
      failure: false,
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setSuccess(true);
    router.refresh();
    // Briefly show success state, then close.
    setTimeout(onClose, 600);
  }

  // The kit Drawer: a right panel on desktop, a bottom sheet on phones (the
  // title stays above the keyboard), with the shared focus trap and Escape.
  return (
    <Drawer
      open
      onClose={() => !saving && onClose()}
      title="Quick add task"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {saving ? "Adding…" : "Add task"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <TextField
          label="Title"
          required
          data-autofocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to happen?"
        />

        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Category"
            required
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as TaskCategory);
              setAssigneeError(null);
            }}
            options={TASK_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
          />
          <SelectField
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Assigned to"
            value={assignee}
            onChange={(e) => {
              setAssignee(e.target.value as AdminUser | "");
              setAssigneeError(null);
            }}
            error={assigneeError ?? undefined}
            placeholder="Unassigned"
            options={assigneeOptions.map((a) => ({ value: a.value, label: a.label }))}
          />
          <DateField label="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <SelectField
            label="Project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="None"
            options={projects.map((p) => ({ value: p.id, label: p.title }))}
          />
        </div>

        <div className="flex flex-wrap items-center gap-5 pt-1">
          <CheckboxField label="Pin for today" checked={pinToday} onChange={(e) => setPinToday(e.target.checked)} />
          <CheckboxField label="Pin for this week" checked={pinWeek} onChange={(e) => setPinWeek(e.target.checked)} />
        </div>

        {error && (
          <p role="alert" className="text-status-critical-text text-xs">
            {error}
          </p>
        )}
        {success && !error && (
          <p role="status" className="text-revenue text-xs">
            Task added.
          </p>
        )}
      </form>
    </Drawer>
  );
}
