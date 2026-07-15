"use client";

import { useState } from "react";
import TaskRow from "./TaskRow";
import {
  TASK_CATEGORIES,
  categoryBadgeClass,
  categoryLabel,
  type OpsTask,
  type TaskCategory,
} from "../_types/ops";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * One tile per task category, showing the count of open tasks (status !=
 * 'done'). Renders straight from TASK_CATEGORIES — the same single source the
 * task dropdowns use — so the panel and the dropdowns can never drift.
 *
 * Each tile toggles an inline list of that category's open tasks (full
 * TaskRow, so tasks can be completed/edited right here). Counts are derived
 * from the same task array the lists render from, so they can't disagree.
 */
export default function CategoryCounts({
  tasks,
  projectNames,
}: {
  /** Open (not done, not archived) tasks — the caller pre-filters. */
  tasks: OpsTask[];
  projectNames: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<TaskCategory | null>(null);

  const byCategory = new Map<TaskCategory, OpsTask[]>();
  for (const t of tasks) {
    if (!(TASK_CATEGORIES as readonly string[]).includes(t.category)) continue;
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  const expandedTasks = expanded ? byCategory.get(expanded) ?? [] : [];

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className={TYPE.sectionHeader}>
          By Category
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-ink-3">
          Click a category to see its tasks
        </span>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {TASK_CATEGORIES.map((cat) => {
          const isOpen = expanded === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setExpanded(isOpen ? null : cat)}
              aria-expanded={isOpen}
              className={`block rounded-lg border-[1.5px] shadow-panel px-3 py-3 text-center transition-colors ${
                isOpen
                  ? "border-orange/60 bg-[#EFE6D4]"
                  : "border-outline bg-surface hover:border-orange/40 hover:bg-[#EFE6D4]"
              }`}
            >
              <div
                className={`inline-block px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(cat)} mb-2`}
              >
                {categoryLabel(cat)}
              </div>
              <div className="font-display font-black text-ink-1 text-2xl leading-none">
                {byCategory.get(cat)?.length ?? 0}
              </div>
              <div className="text-[10px] text-ink-2 mt-1 flex items-center justify-center gap-1">
                open
                <svg
                  viewBox="0 0 16 16"
                  className={`w-2.5 h-2.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>
          );
        })}
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-outline">
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className="text-sm font-semibold text-ink-1">
              {categoryLabel(expanded)}
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-ink-3">
              {expandedTasks.length} open
            </span>
          </div>
          {expandedTasks.length === 0 ? (
            <p className="text-xs text-ink-2">
              No open tasks in this category.
            </p>
          ) : (
            <div className="space-y-1.5">
              {expandedTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  projectName={
                    t.project_id ? projectNames[t.project_id] ?? null : null
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
