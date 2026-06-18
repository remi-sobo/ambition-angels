"use client";

import { useMemo, useState } from "react";
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
 * One Tasks surface. Defaults to the Active scope — open tasks only (anything
 * not done) — with the List / Board switch, grouping, and CRM filter. Completed
 * tasks are treated as archived: they drop off the active surface and live in
 * the Archived scope, where they can be reviewed and reopened (uncheck a row).
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
  const [scope, setScope] = useState<Scope>("active");
  const [view, setView] = useState<View>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("priority");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");

  const openTasks = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const archivedTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "done")
        .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at)),
    [tasks]
  );

  const visibleTasks = useMemo(() => {
    if (linkFilter === "all") return openTasks;
    if (linkFilter === "any") return openTasks.filter((t) => !!t.linked_entity_type);
    return openTasks.filter((t) => t.linked_entity_type === linkFilter);
  }, [openTasks, linkFilter]);

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
            {scope === "active" && linkFilter !== "all" && openTasks.length !== visibleTasks.length
              ? ` / ${openTasks.length}`
              : ""}
          </span>
        </div>

        {scope === "active" && (
          <div className="flex items-center gap-3">
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
          <p className="text-sm text-ink-2 italic">No archived tasks yet — completed tasks land here, newest first.</p>
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
