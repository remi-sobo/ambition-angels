import TaskRow from "./TaskRow";
import Link from "next/link";
import EmptyState from "../../_components/EmptyState";
import type { OpsTask } from "../_types/ops";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * This Week section. Tasks where pinned_for_this_week AND status != 'done'.
 * Tasks WITHOUT a due_date go into an "Anytime this week" bucket at the top.
 * Tasks WITH a due_date are grouped by day in chronological order.
 */
export default function ThisWeekView({
  tasks,
  projectNames,
}: {
  tasks: OpsTask[];
  projectNames: Map<string, string>;
}) {
  const anytime = tasks.filter((t) => !t.due_date);
  const byDay = new Map<string, OpsTask[]>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    const list = byDay.get(t.due_date) ?? [];
    list.push(t);
    byDay.set(t.due_date, list);
  }
  const days = Array.from(byDay.keys()).sort();

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className={TYPE.sectionHeader}>This Week</h2>
        <span className="text-[10px] uppercase tracking-wider text-ink-2">
          {tasks.length} pinned
        </span>
      </header>

      {tasks.length === 0 ? (
        <EmptyState
          label="pinned tasks"
          title="Nothing pinned for this week yet"
          hint="Pin tasks to the week from their row menu, or plan the whole week in one pass."
          action={
            <Link href="/admin/work/plan-close" className="text-xs font-semibold text-orange hover:text-orange-dark">
              Open Plan the Week
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {anytime.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
                Anytime this week
              </h3>
              <div className="space-y-1.5">
                {anytime.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    projectName={t.project_id ? projectNames.get(t.project_id) ?? null : null}
                  />
                ))}
              </div>
            </div>
          )}
          {days.map((day) => {
            const d = new Date(day + "T00:00:00");
            const label = d.toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            });
            return (
              <div key={day}>
                <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
                  {label}
                </h3>
                <div className="space-y-1.5">
                  {(byDay.get(day) ?? []).map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      projectName={t.project_id ? projectNames.get(t.project_id) ?? null : null}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
