"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OpsTask } from "@/app/admin/ops/_types/ops";
import { priorityLabel } from "@/app/admin/ops/_types/ops";
import type { TodayObligation } from "@/lib/admin/today";
import { useAssignees, withSelected } from "../../../_lib/useAssignees";
import Button from "../../../_components/ui/Button";
import Input, { Field, Select } from "../../../_components/ui/Input";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The ops_task panel: who has it, when it's due, and the two quick edits the
 * spec asks for (reschedule, reassign). Both PATCH the existing task route,
 * which owns validation, completed_at and the project touch. The full edit
 * modal is the task's "record" (there is no task page); the shell opens it.
 */

export type TaskPatch = { due_date?: string | null; assigned_to?: string | null };

function linkedHref(t: OpsTask): string | null {
  if (!t.linked_entity_id) return null;
  if (t.linked_entity_type === "constituent") return `/admin/fundraising/donors-funders/${t.linked_entity_id}`;
  if (t.linked_entity_type === "partner") return `/admin/partners/${t.linked_entity_id}`;
  return null;
}

export default function OpsTaskPanel({
  row,
  onLoaded,
  onPatched,
}: {
  row: TodayObligation;
  /** The full task, so the shell can open the edit modal. */
  onLoaded: (task: OpsTask | null) => void;
  /** After a successful reschedule/reassign: the change, for the list row. */
  onPatched: (patch: TaskPatch) => void;
}) {
  const members = useAssignees();
  const [task, setTask] = useState<OpsTask | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState<"due" | "assignee" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setTask(null);
    setLoadError(null);
    setError(null);
    onLoaded(null);
    fetch(`/api/admin/ops/tasks/${row.source_id}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { task?: OpsTask; error?: string } | null;
        if (!alive) return;
        if (!r.ok || !j?.task) {
          setLoadError(j?.error ?? "Couldn't load this task.");
          return;
        }
        setTask(j.task);
        setDue(j.task.due_date ?? "");
        setAssignee(j.task.assigned_to ?? "");
        onLoaded(j.task);
      })
      .catch(() => alive && setLoadError("Couldn't load this task."));
    return () => {
      alive = false;
    };
    // onLoaded is a stable callback from the shell; reload only per task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.source_id]);

  async function patch(field: "due" | "assignee", body: TaskPatch) {
    setSaving(field);
    setError(null);
    try {
      const r = await fetch(`/api/admin/ops/tasks/${row.source_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        setError(j?.error ?? "Couldn't save that change.");
        return;
      }
      setTask((t) => (t ? { ...t, ...body } as OpsTask : t));
      onPatched(body);
    } catch {
      setError("Couldn't reach BloomOS. Check your connection and try again.");
    } finally {
      setSaving(null);
    }
  }

  if (loadError) return <p className={TYPE.bodyMuted}>{loadError}</p>;
  if (!task) return <p className={TYPE.bodyMuted}>Loading the task…</p>;

  const link = linkedHref(task);
  const options = withSelected(members, assignee);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className={TYPE.metadata}>Assigned to</dt>
          <dd className={TYPE.body}>
            {task.assigned_to ? options.find((o) => o.value === task.assigned_to)?.label ?? task.assigned_to : "Nobody yet"}
          </dd>
        </div>
        <div>
          <dt className={TYPE.metadata}>Priority</dt>
          <dd className={TYPE.body}>{priorityLabel(task.priority)}</dd>
        </div>
        {link && (
          <div className="col-span-2">
            <dt className={TYPE.metadata}>Linked to</dt>
            <dd className={TYPE.body}>
              <Link href={link} className="underline underline-offset-2 hover:text-ink-1">
                {task.linked_label || "Open the linked record"}
              </Link>
            </dd>
          </div>
        )}
      </dl>

      {task.description?.trim() && (
        <p className={`${TYPE.bodyMuted} whitespace-pre-line line-clamp-4`}>{task.description}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Due date" htmlFor="popout-due">
          <div className="flex gap-2">
            <Input id="popout-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <Button
              variant="secondary"
              size="sm"
              className="h-9"
              disabled={saving !== null || due === (task.due_date ?? "")}
              onClick={() => patch("due", { due_date: due || null })}
            >
              {saving === "due" ? "…" : "Reschedule"}
            </Button>
          </div>
        </Field>
        <Field label="Assignee" htmlFor="popout-assignee">
          <div className="flex gap-2">
            <Select id="popout-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              className="h-9"
              disabled={saving !== null || assignee === (task.assigned_to ?? "")}
              onClick={() => patch("assignee", { assigned_to: assignee || null })}
            >
              {saving === "assignee" ? "…" : "Reassign"}
            </Button>
          </div>
        </Field>
      </div>

      {error && <p className="text-xs font-medium text-status-critical-text">{error}</p>}
    </div>
  );
}
