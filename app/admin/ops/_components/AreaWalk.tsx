import Link from "next/link";
import { loadAreaWalk } from "@/lib/admin/ops/area-walk";
import TaskRowWithActions, { type TaskRowAction } from "./TaskRowWithActions";
import {
  categoryLabel,
  projectStatusBadgeClass,
  formatRelative,
  type OpsTask,
} from "../_types/ops";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Step 3 of the Monday Plan: walk the areas. For each `category` with live work,
 * its active projects (each showing the strategy initiative it serves) and its
 * loose open tasks. Decide the few things that must move and pin them
 * (pinned_for_this_week). Empty areas don't render — the walk is only the areas
 * that have work. A soft per-area cap nudges toward "the few", not all of it.
 */

// The "pin the few" cap, per area. Soft: we surface it, we don't block.
const PIN_CAP = 3;

function pinAction(task: OpsTask): TaskRowAction {
  return task.pinned_for_this_week
    ? { label: "Pinned ✓", variant: "ghost", patch: { pinned_for_this_week: false } }
    : { label: "Pin", variant: "primary", patch: { pinned_for_this_week: true } };
}

export default async function AreaWalk({
  orgId,
  handle,
}: {
  orgId: string | null;
  handle: string;
}) {
  const areas = await loadAreaWalk(orgId, handle);

  if (areas.length === 0) {
    return (
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <h2 className={`${TYPE.sectionHeader} mb-2`}>Walk the areas</h2>
        <p className="text-sm text-ink-2 italic">
          No active work in any area yet. Add a project or a task and it&apos;ll show up here.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6 space-y-4">
      <div>
        <h2 className={TYPE.sectionHeader}>Walk the areas</h2>
        <p className="text-sm text-ink-2 mt-1">
          For each area, decide the few things that must move and pin them. Each project shows the
          initiative it serves.
        </p>
      </div>

      {areas.map((area, i) => {
        const overCap = area.pinnedCount > PIN_CAP;
        return (
          <details key={area.category} open={i === 0} className="group rounded-card-lg border-[1.5px] border-outline bg-tile/40">
            <summary className="cursor-pointer select-none flex items-center gap-2 px-4 py-3">
              <span className="text-sm font-semibold text-ink-1 group-open:text-orange transition-colors">
                {categoryLabel(area.category)}
              </span>
              <span className="text-[11px] text-ink-2">
                {area.projects.length} {area.projects.length === 1 ? "project" : "projects"} ·{" "}
                {area.looseTasks.length} loose
              </span>
              <span
                className={`ml-auto text-[11px] font-mono ${
                  overCap ? "text-expense font-semibold" : "text-ink-2"
                }`}
                title={`Pinned ${area.pinnedCount} of a suggested ${PIN_CAP} for this area`}
              >
                {area.pinnedCount}/{PIN_CAP} pinned
              </span>
            </summary>

            <div className="px-4 pb-4 space-y-3">
              {/* Projects, each with its initiative read */}
              {area.projects.length > 0 && (
                <div className="space-y-1.5">
                  {area.projects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/admin/ops/projects/${p.id}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg border-[1.5px] border-outline bg-surface shadow-panel hover:bg-[#EFE6D4] transition-colors group/row"
                    >
                      <span className="text-sm text-ink-1 group-hover/row:text-orange truncate max-w-[40%]">
                        {p.title}
                      </span>
                      {p.initiativeLabel ? (
                        <span
                          className="text-[10px] text-orange/80 truncate max-w-[35%]"
                          title={`Serves: ${p.initiativeLabel}`}
                        >
                          ↳ {p.initiativeLabel}
                        </span>
                      ) : (
                        <span className="text-[10px] text-ink-3 italic">no initiative</span>
                      )}
                      <span
                        className={`ml-auto shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${projectStatusBadgeClass(
                          p.status
                        )}`}
                      >
                        {p.status}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-2 font-mono">
                        {p.openTaskCount} open
                      </span>
                      <span className="shrink-0 text-[11px] text-[#A56A1B]/70 font-mono">
                        {formatRelative(p.last_touched_at)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {/* Loose tasks — the triage-and-pin list */}
              {area.looseTasks.length > 0 ? (
                <div className="space-y-1.5">
                  {area.looseTasks.map((t) => (
                    <TaskRowWithActions
                      key={t.id}
                      task={t}
                      showProject={false}
                      actions={[pinAction(t)]}
                    />
                  ))}
                </div>
              ) : (
                area.projects.length > 0 && (
                  <p className="text-[11px] text-ink-3 italic pl-1">
                    No loose tasks — all this area&apos;s work hangs off its projects.
                  </p>
                )
              )}
            </div>
          </details>
        );
      })}
    </section>
  );
}
