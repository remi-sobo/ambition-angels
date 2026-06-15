"use client";

import { useState } from "react";
import type { AdminUser } from "@/lib/admin/auth";
import TaskListView, { type GroupBy } from "./TaskListView";
import TaskBoardView from "./TaskBoardView";
import type { OpsTask } from "../_types/ops";

type View = "list" | "board";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "category", label: "Department" },
  { value: "project", label: "Project" },
];

/**
 * One Tasks surface with a List / Board switch. List groups four ways and
 * keeps drag-reorder, subtasks, and inline quick-add; Board moves tasks
 * between status columns. Both read the same task set.
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
  const [view, setView] = useState<View>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("priority");

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-xs uppercase tracking-wider text-ink-2">Tasks</h2>
          <span className="text-[11px] text-ink-3">{tasks.length}</span>
        </div>

        <div className="flex items-center gap-3">
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
                  view === v
                    ? "bg-orange text-white"
                    : "text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </header>

      {view === "list" ? (
        <TaskListView
          tasks={tasks}
          projectNames={projectNames}
          groupBy={groupBy}
          currentUser={currentUser}
        />
      ) : (
        <TaskBoardView tasks={tasks} projectNames={projectNames} />
      )}
    </section>
  );
}
