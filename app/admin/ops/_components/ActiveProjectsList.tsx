import Link from "next/link";
import {
  categoryBadgeClass,
  categoryLabel,
  formatRelative,
  formatDueLabel,
  type OpsProject,
} from "../_types/ops";

export default function ActiveProjectsList({
  projects,
  openTaskCounts,
}: {
  projects: OpsProject[];
  openTaskCounts: Map<string, number>;
}) {
  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs uppercase tracking-wider text-ink-2">
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
        <p className="text-sm text-ink-2">
          No active projects yet. Create one from the projects page.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => {
            const open = openTaskCounts.get(p.id) ?? 0;
            return (
              <Link
                key={p.id}
                href={`/admin/ops/projects/${p.id}`}
                className="block rounded-lg border-[1.5px] border-outline bg-surface shadow-panel hover:bg-[#EFE6D4] transition-colors p-4 group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-medium text-ink-1 group-hover:text-orange transition-colors truncate">
                    {p.title}
                  </h3>
                  <span
                    className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(p.category)}`}
                  >
                    {categoryLabel(p.category)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-ink-2">
                  <div className="flex items-center gap-3">
                    {p.assigned_to && (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-flex w-4 h-4 rounded-full bg-tile text-ink-1 items-center justify-center text-[9px] font-bold uppercase">
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
