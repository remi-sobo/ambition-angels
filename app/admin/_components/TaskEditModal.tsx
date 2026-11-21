"use client";

import { useRouter } from "next/navigation";
import { useConfirm } from "./feedback/ConfirmProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import { useEffect, useState } from "react";
import {
  ASSIGNEE_REQUIRED_MESSAGE,
  TASK_CATEGORIES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  categoryLabel,
  priorityLabel,
  readTaskHealth,
  taskHasAssignee,
  todayISO,
  type TaskCategory,
  type OpsTask,
  type TaskStatus,
  type TaskPriority,
} from "@/app/admin/ops/_types/ops";
import { useIsOwner } from "./AdminUserContext";
import { useAssignees, withSelected } from "../_lib/useAssignees";
import { TYPE } from "@/lib/admin/typeScale";
import Drawer from "./ui/Drawer";
import Button from "./ui/Button";
import { TextField, TextareaField, SelectField, DateField, CheckboxField } from "./ui/Field";
import { ESTIMATE_CHIPS, formatEstimate } from "@/lib/admin/ops/estimates";

/** Pull any report screenshot URLs out of a task description for inline preview. */
function extractImageUrls(text: string | null): string[] {
  if (!text) return [];
  const urls = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  return urls.filter((u) => /bloomos-reports/.test(u) || /\.(png|jpe?g|webp|gif|heic|heif)(\?|$)/i.test(u));
}

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
  const confirm = useConfirm();

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
  const [assignee, setAssignee] = useState<string>(task.assigned_to ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [pinToday, setPinToday] = useState(task.pinned_for_today);
  const [pinWeek, setPinWeek] = useState(task.pinned_for_this_week);
  const [estimate, setEstimate] = useState<number | null>(task.estimated_minutes ?? null);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isOwner = useIsOwner();
  const members = useAssignees();
  const assigneeOptions = withSelected(members, assignee);

  // ── Stuck-work forcing prompt ──────────────────────────────────────────────
  // A dismissible strip (NOT an auto-modal — that friction makes people stop
  // opening tasks). Shown only when the task reads 'stuck'. Offers the four
  // dispositions the spec forces a choice between: decompose / delegate /
  // schedule / drop. (specs/ops-stuck-work.md)
  const { health: taskHealthState, stuckReason } = readTaskHealth(task);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptMsg, setPromptMsg] = useState<string | null>(null);
  const [decomposing, setDecomposing] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const showStuckPrompt = taskHealthState === "stuck" && !promptDismissed;

  // Apply a quick disposition (delegate/schedule) and collapse the strip into a
  // confirmation. updated_at moves, so the task stops reading 'stuck' next load.
  async function promptPatch(body: Record<string, unknown>, successMsg: string) {
    setPromptBusy(true);
    try {
      const r = await fetch(`/api/admin/ops/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      router.refresh();
      setPromptMsg(successMsg);
    } catch {
      setPromptMsg("Couldn't apply. Try again.");
    } finally {
      setPromptBusy(false);
    }
  }

  function delegate() {
    // Hand off to another org member — the next one who isn't the current
    // assignee. With no other member to hand to, this is a no-op.
    const next = members.find((m) => m.value !== assignee);
    if (!next) return;
    setAssignee(next.value);
    void promptPatch({ assigned_to: next.value }, `Delegated to ${next.label}.`);
  }

  function schedule() {
    // Commit it to a day — today. Setting planned_day pins the week server-side.
    const today = todayISO();
    if (!dueDate) setDueDate(today);
    void promptPatch({ planned_day: today }, "Scheduled for today.");
  }

  async function drop() {
    // Archive and close — the honest "this isn't happening" exit.
    setPromptBusy(true);
    try {
      const r = await fetch(`/api/admin/ops/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived_at: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      router.refresh();
      onClose();
    } catch {
      setPromptMsg("Couldn't drop. Try again.");
      setPromptBusy(false);
    }
  }

  async function addSubtask() {
    const t = subtaskTitle.trim();
    if (!t) return;
    setPromptBusy(true);
    try {
      const r = await fetch(`/api/admin/ops/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          parent_id: task.id,
          category: task.category,
          project_id: task.project_id,
          assigned_to: task.assigned_to,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      router.refresh();
      setSubtaskTitle("");
      setDecomposing(false);
      setPromptMsg("Subtask added. Break the rest down the same way.");
    } catch {
      setPromptMsg("Couldn't add subtask. Try again.");
    } finally {
      setPromptBusy(false);
    }
  }

  // Tasks filed by the guided reporter carry a ready-to-paste Claude Code prompt
  // as their description. The copy affordance is owner-only by design —
  // everyone else can report, but the prompt-to-paste step is the org owner's.
  const hasClaudePrompt = (task.labels ?? []).includes("claude-prompt") && isOwner;
  const photoUrls = extractImageUrls(task.description);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(task.description ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy. Select the description text and copy manually.");
    }
  }

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
    if (!taskHasAssignee(assignee, category)) {
      setAssigneeError(ASSIGNEE_REQUIRED_MESSAGE);
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
          estimated_minutes: estimate,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(userMessage(r, body));
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(networkMessage());
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete task "${task.title}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/ops/tasks/${task.id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(userMessage(r, body));
        setDeleting(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(networkMessage());
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    // The kit Drawer (V4 P1): focus trap, Escape and scrim close (held while
    // a save or delete is in flight), a phone sheet, and a pinned footer.
    <Drawer
      open
      onClose={() => !busy && onClose()}
      title="Edit task"
      width={560}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={busy}>
            {deleting ? "Deleting…" : "Delete task"}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="task-edit-form" disabled={busy} loading={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      }
    >
        <form id="task-edit-form" onSubmit={submit} className="space-y-4">
          {showStuckPrompt && (
            <div className="rounded-control border border-status-watch/30 bg-status-watch-bg px-3 py-2.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs text-ink-1">
                  <span className="font-semibold uppercase tracking-wider text-status-watch-text">
                    Stuck
                  </span>
                  <span className="text-ink-2">, {stuckReason}. Pick one:</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPromptDismissed(true)}
                  className={`shrink-0 text-ink-3 hover:${TYPE.body} leading-none`}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>

              {promptMsg ? (
                <p className="text-xs text-ink-2">{promptMsg}</p>
              ) : decomposing ? (
                <div className="flex items-center gap-2">
                  <input
                    aria-label="First concrete step"
                    type="text"
                    value={subtaskTitle}
                    onChange={(e) => setSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addSubtask();
                      }
                    }}
                    placeholder="First concrete step…"
                    className="flex-1 bg-tile border-hairline rounded-control px-2.5 py-1.5 text-xs text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/50"
                  />
                  <button
                    type="button"
                    onClick={() => void addSubtask()}
                    disabled={promptBusy || !subtaskTitle.trim()}
                    className="shrink-0 bg-orange hover:bg-orange-dark disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-control"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <StuckAction label="Decompose" onClick={() => setDecomposing(true)} disabled={promptBusy} />
                  {members.some((m) => m.value !== assignee) && (
                    <StuckAction label="Delegate" onClick={delegate} disabled={promptBusy} />
                  )}
                  <StuckAction label="Schedule" onClick={schedule} disabled={promptBusy} />
                  <StuckAction label="Drop" onClick={() => void drop()} disabled={promptBusy} danger />
                </div>
              )}
            </div>
          )}

          <TextField
            label="Title"
            required
            data-autofocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            controlSize="md"
          />

          <div>
            <TextareaField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={hasClaudePrompt ? 6 : 3}
              placeholder="Notes, context, links…"
            />
            {hasClaudePrompt && (
              <button
                type="button"
                onClick={copyPrompt}
                className="mt-2 inline-flex items-center gap-1.5 bg-orange/15 border border-orange/30 text-ink-1 hover:bg-orange/25 text-xs font-semibold px-3 py-1.5 rounded-control transition-colors"
              >
                {copied ? "Copied ✓" : "Copy for Claude Code"}
              </button>
            )}
            {photoUrls.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {photoUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="Report screenshot"
                      className="max-h-48 rounded-control border-hairline object-contain hover:opacity-90 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Category"
              required
              controlSize="md"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as TaskCategory);
                setAssigneeError(null);
              }}
              options={TASK_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
            />
            <SelectField
              label="Status"
              controlSize="md"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              options={TASK_STATUSES.map((st) => ({ value: st, label: st.replace("_", " ") }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Priority"
              controlSize="md"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              options={TASK_PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
            />
            <TextField
              label="Labels"
              controlSize="md"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              placeholder="comma, separated"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Assigned to"
              controlSize="md"
              value={assignee}
              onChange={(e) => {
                setAssignee(e.target.value);
                setAssigneeError(null);
              }}
              error={assigneeError ?? undefined}
              placeholder="Unassigned"
              options={assigneeOptions.map((a) => ({ value: a.value, label: a.label }))}
            />
            <DateField label="Due date" controlSize="md" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <SelectField
            label="Project"
            controlSize="md"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="None"
            options={projects.map((p) => ({ value: p.id, label: p.title }))}
          />

          {/* A div, not Field: Field is a <label>, which would forward clicks
              to the first chip. */}
          <div role="group" aria-labelledby="task-estimate-label">
            <div id="task-estimate-label" className="text-xs uppercase tracking-wider text-ink-2 mb-1">
              Estimate
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ESTIMATE_CHIPS.map((m) => {
                const on = estimate === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEstimate(on ? null : m)}
                    aria-pressed={on}
                    className={`text-sm px-2.5 py-1 rounded-control border tabular-nums transition-colors ${
                      on
                        ? "bg-orange text-white border-orange"
                        : "bg-tile border-hairline text-ink-1 hover:border-orange/50"
                    }`}
                  >
                    {formatEstimate(m)}
                  </button>
                );
              })}
              {estimate != null && !(ESTIMATE_CHIPS as readonly number[]).includes(estimate) && (
                <span className="text-sm px-2.5 py-1 rounded-control border border-orange bg-orange-light text-orange-dark tabular-nums">
                  {formatEstimate(estimate)}
                </span>
              )}
            </div>
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
        </form>
    </Drawer>
  );
}

function StuckAction({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-xs font-semibold px-3 py-1.5 rounded-control border transition-colors disabled:opacity-50 ${
        danger
          ? "border-expense/30 bg-expense-bg text-expense hover:bg-expense-bg"
          : "border-hairline bg-tile text-ink-1 hover:border-orange/60"
      }`}
    >
      {label}
    </button>
  );
}
