import TaskRow from "./TaskRow";
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
}: {
  tasks: OpsTask[];
  projectNames: Record<string, string>;
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
                        <TaskRow
                          key={t.id}
                          task={t}
                          projectName={t.project_id ? projectNames[t.project_id] ?? null : null}
                        />
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
