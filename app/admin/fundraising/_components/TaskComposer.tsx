"use client";

// One modal to turn a list view into action: create a linked follow-up task
// for one donor/prospect (row action) or a batch of them (bulk action).
// Tasks land in ops_tasks with an entity link, so they show up on the record's
// profile, the Tasks column, Ops, Today, and Needs You — same spine as
// EntityTasks, just launchable from the tables where segments live.

import { useEffect, useState } from "react";
import { TASK_PRIORITIES, type TaskPriority } from "../../ops/_types/ops";
import { useAssignees, withSelected } from "../../_lib/useAssignees";
import { useAdminUser } from "../../_components/AdminUserContext";
import { TYPE } from "@/lib/admin/typeScale";

export type TaskTarget = { id: string; name: string };

const fieldCls =
  "w-full bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2.5 text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50 text-base sm:text-sm";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose(0);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

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
            title: single ? title.trim() : `${title.trim()} — ${t.name}`,
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
        `Created ${created} of ${targets.length} — failed for ${failed.slice(0, 3).join(", ")}` +
          (failed.length > 3 ? ` and ${failed.length - 3} more` : "") +
          ". Try again for the rest."
      );
      return;
    }
    onClose(created);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:px-4"
      onClick={() => !saving && onClose(0)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-card border-[1.5px] border-outline bg-ink shadow-2xl max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
          <h2 className={TYPE.modalTitle}>
            {single ? `Task for ${targets[0].name}` : `Task for ${targets.length} ${entityType === "constituent" ? "donors" : "prospects"}`}
          </h2>

          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">
              Task <span className="text-orange">*</span>
            </div>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={fieldCls} />
            {!single && (
              <p className="mt-1 text-[11px] text-ink-3">
                One task per person, name appended: &ldquo;{title.trim() || "…"} — {targets[0].name}&rdquo;, …
              </p>
            )}
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">Due</div>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={fieldCls} />
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">Priority</div>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={`${fieldCls} capitalize`}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p} className="bg-surface capitalize">{p}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">Owner</div>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={fieldCls}>
                {assigneeOptions.map((a) => (
                  <option key={a.value} value={a.value} className="bg-surface">{a.label}</option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="text-expense text-xs">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={() => onClose(0)} disabled={saving} className="text-sm text-ink-2 hover:text-ink-1 px-4 py-2.5">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
              {saving
                ? "Creating…"
                : single
                ? "Add task"
                : `Add ${targets.length} tasks`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
