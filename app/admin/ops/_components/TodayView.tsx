import TaskRow from "./TaskRow";
import type { OpsTask } from "../_types/ops";

/**
 * Today section of the Ops landing.
 * - "Due today" comes first: tasks where due_date == today AND status != 'done'.
 * - "Pinned for today" comes second: pinned_for_today AND status != 'done'
 *   AND (due_date != today OR due_date IS NULL), so we don't double-render
 *   a task that's both due today and pinned today.
 */
export default function TodayView({
  dueToday,
  pinnedToday,
  projectNames,
}: {
  dueToday: OpsTask[];
  pinnedToday: OpsTask[];
  projectNames: Map<string, string>;
}) {
  const isEmpty = dueToday.length === 0 && pinnedToday.length === 0;

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-black/30 p-6">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs uppercase tracking-wider text-ink-2">Today</h2>
        <span className="text-[10px] uppercase tracking-wider text-ink-2">
          {dueToday.length + pinnedToday.length} open
        </span>
      </header>

      {isEmpty ? (
        <p className="text-sm text-ink-2">
          Nothing for today yet. Use the{" "}
          <span className="inline-block px-1.5 py-0.5 rounded bg-orange/10 text-orange border border-orange/30 font-bold">
            +
          </span>{" "}
          button to add something.
        </p>
      ) : (
        <div className="space-y-5">
          {dueToday.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
                Due today
              </h3>
              <div className="space-y-1.5">
                {dueToday.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    projectName={t.project_id ? projectNames.get(t.project_id) ?? null : null}
                  />
                ))}
              </div>
            </div>
          )}

          {pinnedToday.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
                Pinned for today
              </h3>
              <div className="space-y-1.5">
                {pinnedToday.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    projectName={t.project_id ? projectNames.get(t.project_id) ?? null : null}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
