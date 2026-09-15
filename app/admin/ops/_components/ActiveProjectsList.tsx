import Link from "next/link";
import EmptyState from "../../_components/EmptyState";
import {
  categoryBadgeClass,
  categoryLabel,
  formatRelative,
  formatDueLabel,
  type OpsProject,
} from "../_types/ops";
import { TYPE } from "@/lib/admin/typeScale";

export default function ActiveProjectsList({
  projects,
  openTaskCounts,
}: {
  projects: OpsProject[];
  openTaskCounts: Map<string, number>;
}) {
  return (
    <section className="rounded-panel border-hairline bg-surface p-6">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className={TYPE.sectionHeader}>
          Active Projects
        </h2>
        <Link
          href="/admin/ops/projects"
          className="text-xs text-orange hover:underline"
        >
          View all →
        </Link>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          label="active projects"
          hint="Projects group tasks with a goal and an owner."
          action={
            <Link href="/admin/ops/projects" className="text-xs font-semibold text-orange hover:text-orange-dark">
              Create the first project
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => {
            const open = openTaskCounts.get(p.id) ?? 0;
            return (
              <Link
                key={p.id}
                href={`/admin/ops/projects/${p.id}`}
                className="block rounded-control border-hairline bg-surface hover:bg-tile transition-colors p-4 group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-medium text-ink-1 group-hover:text-orange transition-colors truncate">
                    {p.title}
                  </h3>
                  <span
                    className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-xs uppercase tracking-wider font-semibold border ${categoryBadgeClass(p.category)}`}
                  >
                    {categoryLabel(p.category)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-2">
                  <div className="flex items-center gap-3">
                    {p.assigned_to && (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-flex w-4 h-4 rounded-full bg-tile text-ink-1 items-center justify-center text-xs font-bold uppercase">
                          {p.assigned_to.charAt(0)}
                        </span>
                        <span>{p.assigned_to}</span>
                      </span>
                    )}
                    {p.due_date && (
                      <span className="font-mono">{formatDueLabel(p.due_date)}</span>
                    )}
                    <span>
                      {open} open task{open === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="text-ink-3">{formatRelative(p.last_touched_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
