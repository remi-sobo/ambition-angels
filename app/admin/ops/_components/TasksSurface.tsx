"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/admin/auth";
import TaskListView, { type GroupBy } from "./TaskListView";
import TaskBoardView from "./TaskBoardView";
import TaskRow from "./TaskRow";
import type { OpsTask } from "../_types/ops";

type View = "list" | "board";
type Scope = "active" | "archived";
type LinkFilter = "all" | "any" | "partner" | "constituent";

const LINK_OPTIONS: { value: LinkFilter; label: string }[] = [
  { value: "all", label: "All tasks" },
  { value: "any", label: "CRM-linked" },
  { value: "partner", label: "Partners" },
  { value: "constituent", label: "Donors" },
];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "category", label: "Department" },
  { value: "project", label: "Project" },
];

/**
 * One Tasks surface. Defaults to the Active scope — everything not archived
 * (open tasks and done-but-not-yet-archived) — with the List / Board switch,
 * grouping, and CRM filter. Archiving is a separate, explicit step (the row
 * menu's "Archive"): archived tasks drop off the active surface into the
 * Archived scope, where they can be reviewed, reopened, or unarchived.
 */
export default function TasksSurface({
  tasks,
  projectNames,
  currentUser,
}: {
  tasks: OpsTask[];
  projectNames: Record<string, string>;
  currentUser: AdminUser | null;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("active");
  const [view, setView] = useState<View>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("priority");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [archiving, setArchiving] = useState(false);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archived_at), [tasks]);
  const archivedTasks = useMemo(
    () =>
      tasks
        .filter((t) => !!t.archived_at)
        .sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? "")),
    [tasks]
  );

  const visibleTasks = useMemo(() => {
    if (linkFilter === "all") return activeTasks;
    if (linkFilter === "any") return activeTasks.filter((t) => !!t.linked_entity_type);
    return activeTasks.filter((t) => t.linked_entity_type === linkFilter);
  }, [activeTasks, linkFilter]);

  // One-tap archive of every done-but-not-yet-archived task on the active surface.
  const doneActive = useMemo(() => activeTasks.filter((t) => t.status === "done"), [activeTasks]);

  async function archiveAllDone() {
    if (doneActive.length === 0 || archiving) return;
    setArchiving(true);
    try {
      const now = new Date().toISOString();
      await Promise.all(
        doneActive.map((t) =>
          fetch(`/api/admin/ops/tasks/${t.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ archived_at: now }),
          })
        )
      );
      router.refresh();
    } catch (e) {
      console.error("Archive-all-done failed:", e);
      alert("Couldn't archive some tasks. Try again.");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xs uppercase tracking-wider text-ink-2">Tasks</h2>

          <div className="inline-flex rounded-lg border-[1.5px] border-outline bg-surface shadow-panel p-1">
            {(["active", "archived"] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  scope === s ? "bg-orange text-white" : "text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4]"
                }`}
              >
                {s === "active" ? "Active" : `Archived (${archivedTasks.length})`}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-ink-3">
            {scope === "active" ? visibleTasks.length : archivedTasks.length}
            {scope === "active" && linkFilter !== "all" && activeTasks.length !== visibleTasks.length
              ? ` / ${activeTasks.length}`
              : ""}
          </span>
        </div>

        {scope === "active" && (
          <div className="flex items-center gap-3">
            {doneActive.length > 0 && (
              <button
                type="button"
                onClick={archiveAllDone}
                disabled={archiving}
                className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
              >
                {archiving ? "Archiving…" : `Archive done (${doneActive.length})`}
              </button>
            )}
            <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-2">
              Linked
              <select
                value={linkFilter}
                onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
                className="bg-tile border-[1.5px] border-outline rounded-lg px-2.5 py-1.5 text-xs text-ink-1 normal-case tracking-normal focus:outline-none focus:border-orange/50"
              >
                {LINK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {view === "list" && (
              <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-2">
                Group by
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  className="bg-tile border-[1.5px] border-outline rounded-lg px-2.5 py-1.5 text-xs text-ink-1 normal-case tracking-normal focus:outline-none focus:border-orange/50"
                >
                  {GROUP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="inline-flex rounded-lg border-[1.5px] border-outline bg-surface shadow-panel p-1">
              {(["list", "board"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                    view === v ? "bg-orange text-white" : "text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {scope === "archived" ? (
        archivedTasks.length === 0 ? (
          <p className="text-sm text-ink-2 italic">No archived tasks yet — use a task&apos;s ⋯ menu → Archive to file it here.</p>
        ) : (
          <div className="space-y-1.5">
            {archivedTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                projectName={t.project_id ? projectNames[t.project_id] ?? null : null}
              />
            ))}
          </div>
        )
      ) : view === "list" ? (
        <TaskListView tasks={visibleTasks} projectNames={projectNames} groupBy={groupBy} currentUser={currentUser} />
      ) : (
        <TaskBoardView tasks={visibleTasks} projectNames={projectNames} />
      )}
    </section>
  );
}
