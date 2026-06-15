import {
  TASK_CATEGORIES,
  categoryBadgeClass,
  categoryLabel,
  type TaskCategory,
} from "../_types/ops";

/**
 * One tile per task category, showing the count of open tasks (status !=
 * 'done'). Renders straight from TASK_CATEGORIES — the same single source the
 * task dropdowns use — so the panel and the dropdowns can never drift.
 */
export default function CategoryCounts({
  counts,
}: {
  counts: Record<TaskCategory, number>;
}) {
  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs uppercase tracking-wider text-ink-2">
          By Category
        </h2>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {TASK_CATEGORIES.map((cat) => (
          <div
            key={cat}
            className="block rounded-lg border-[1.5px] border-outline bg-surface shadow-panel px-3 py-3 text-center"
          >
            <div
              className={`inline-block px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(cat)} mb-2`}
            >
              {categoryLabel(cat)}
            </div>
            <div className="font-display font-black text-ink-1 text-2xl leading-none">
              {counts[cat] ?? 0}
            </div>
            <div className="text-[10px] text-ink-2 mt-1">open</div>
          </div>
        ))}
      </div>
    </section>
  );
}
