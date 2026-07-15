import Link from "next/link";
import TaskRow from "./TaskRow";
import type { StuckProjectContext } from "@/lib/admin/ops/stuck-context";
import {
  TASK_CATEGORIES,
  categoryLabel,
  type AdminUserId,
  type OpsTask,
  type TaskCategory,
} from "../_types/ops";

/**
 * Stuck Work rollup (specs/ops-stuck-work.md). Lists chronically deferred
 * tasks — the ones reading 'stuck' — grouped by assignee, then by category,
 * so the "this keeps coming up and never moves" pile is finally visible.
 *
 * The caller computes the stuck set with the same readTaskHealth() helper the
 * row badges use, so the rollup can never disagree with the badges. (The
 * v_ops_task_health view is the SQL-side equivalent for non-UI consumers.)
 *
 * Rows render as full TaskRow, so opening one from the rollup gives Shannon
 * the four-verb forcing prompt directly. roll_count (the punt signal) rides
 * along on each row but is kept distinct from the stuck read.
 *
 * Beneath each row, a context line identifies the work: the project (linked
 * to its page) plus the fundraising identifiers derived for it — donor,
 * partnership — with empty fields simply omitted (lib/admin/ops/
 * stuck-context.ts). A task with no project gets a muted nudge instead,
 * since "unidentifiable" is usually part of why it's stuck.
 */

// Assignee buckets in display order; null assignee falls into "Unassigned".
const ASSIGNEE_ORDER: Array<{ key: AdminUserId | "unassigned"; label: string }> = [
  { key: "remi", label: "Remi" },
  { key: "shannon", label: "Shannon" },
  { key: "unassigned", label: "Unassigned" },
];

export default function StuckWorkRollup({
  tasks,
  projectNames,
  projectContext = {},
}: {
  tasks: OpsTask[];
  projectNames: Record<string, string>;
  projectContext?: Record<string, StuckProjectContext>;
}) {
  if (tasks.length === 0) return null;

  const byAssignee = new Map<AdminUserId | "unassigned", OpsTask[]>();
  for (const t of tasks) {
    const key = (t.assigned_to ?? "unassigned") as AdminUserId | "unassigned";
    const list = byAssignee.get(key) ?? [];
    list.push(t);
    byAssignee.set(key, list);
  }

  return (
    <section className="rounded-card border-[1.5px] border-status-watch/30 bg-surface p-6">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs uppercase tracking-wider text-status-watch-text">
          Stuck Work
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-ink-2">
          {tasks.length} stuck
        </span>
      </header>

      <p className="text-xs text-ink-2 mb-5">
        Open 14+ days with no movement in the last week. Decompose, delegate,
        schedule, or drop each one.
      </p>

      <div className="space-y-6">
        {ASSIGNEE_ORDER.map(({ key, label }) => {
          const forAssignee = byAssignee.get(key);
          if (!forAssignee || forAssignee.length === 0) return null;

          // Group this assignee's stuck tasks by category, in the canonical
          // category order, dropping empty categories.
          const byCategory = new Map<TaskCategory, OpsTask[]>();
          for (const t of forAssignee) {
            const cat = (TASK_CATEGORIES as readonly string[]).includes(t.category)
              ? t.category
              : ("other" as TaskCategory);
            const list = byCategory.get(cat) ?? [];
            list.push(t);
            byCategory.set(cat, list);
          }

          return (
            <div key={key}>
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="text-sm font-semibold text-ink-1">{label}</h3>
                <span className="text-[10px] uppercase tracking-wider text-ink-3">
                  {forAssignee.length} stuck
                </span>
              </div>
              <div className="space-y-4 pl-1">
                {TASK_CATEGORIES.filter((c) => byCategory.has(c)).map((cat) => (
                  <div key={cat}>
                    <h4 className="text-[10px] uppercase tracking-wider text-ink-3 mb-1.5">
                      {categoryLabel(cat)}
                    </h4>
                    <div className="space-y-1.5">
                      {(byCategory.get(cat) ?? []).map((t) => (
                        <div key={t.id}>
                          {/* The context line below carries the project link,
                              so the row's inline #project pill is hidden to
                              avoid saying it twice. */}
                          <TaskRow task={t} hideProjectLink />
                          <ProjectContextLine
                            context={
                              t.project_id
                                ? projectContext[t.project_id] ?? {
                                    // Loader miss (shouldn't happen — service
                                    // client, FK-backed id): still link the
                                    // project by name rather than lying that
                                    // there isn't one.
                                    id: t.project_id,
                                    title: projectNames[t.project_id] ?? "Untitled project",
                                    donors: [],
                                    partnerships: [],
                                  }
                                : null
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * One compact labeled line under a stuck TaskRow: the project (linked to its
 * BloomOS page) and whichever identifiers exist for it. Empty fields are
 * omitted, never rendered as blank labels. Sits outside the TaskRow's
 * interactive surface, so clicking the link can't toggle/edit/delete the task.
 * Left padding lines the text up under the row's title (row px-3 + checkbox
 * w-5 + gap-3 = 44px = pl-11).
 */
function ProjectContextLine({
  context,
}: {
  context: StuckProjectContext | null;
}) {
  if (!context) {
    return (
      <p
        className="pl-11 pt-1 text-[11px] italic text-ink-3"
        title="Click the task title to open it and attach a project"
      >
        No linked project
      </p>
    );
  }

  const fields: Array<{ label: string; value: string }> = [];
  if (context.donors.length > 0)
    fields.push({ label: "Donor", value: context.donors.join(", ") });
  if (context.partnerships.length > 0)
    fields.push({ label: "Partnership", value: context.partnerships.join(", ") });

  return (
    <div className="pl-11 pt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[11px]">
      <span className="inline-flex items-baseline gap-1.5 min-w-0">
        <span className="uppercase tracking-wider text-[10px] text-ink-3">
          Project
        </span>
        <Link
          href={`/admin/ops/projects/${context.id}`}
          className="text-orange/80 hover:text-orange hover:underline truncate max-w-[280px]"
          title={`Open project: ${context.title}`}
        >
          {context.title} →
        </Link>
      </span>
      {fields.map((f) => (
        <span key={f.label} className="inline-flex items-baseline gap-1.5 min-w-0">
          <span className="uppercase tracking-wider text-[10px] text-ink-3">
            {f.label}
          </span>
          <span className="text-ink-2 truncate max-w-[280px]">{f.value}</span>
        </span>
      ))}
    </div>
  );
}
