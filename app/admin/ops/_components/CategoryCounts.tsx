import Link from "next/link";
import {
  CATEGORIES,
  categoryBadgeClass,
  categoryLabel,
  type Category,
} from "../_types/ops";

/**
 * Eight tiles, one per category, showing count of open tasks
 * (status != 'done'). Tile click navigates to the projects list filtered
 * by category. Tasks-by-category filter on the list page comes later;
 * filtering projects by category is the closest shipped surface.
 */
export default function CategoryCounts({
  counts,
}: {
  counts: Record<Category, number>;
}) {
  return (
    <section className="rounded-card border border-white/10 bg-black/30 p-6">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs uppercase tracking-wider text-gray-mid">
          By Category
        </h2>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat}
            href={`/admin/ops/projects?category=${cat}`}
            className="block rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-colors px-3 py-3 text-center group"
          >
            <div
              className={`inline-block px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(cat)} mb-2`}
            >
              {categoryLabel(cat)}
            </div>
            <div className="font-display font-black text-cream text-2xl leading-none">
              {counts[cat] ?? 0}
            </div>
            <div className="text-[10px] text-gray-mid mt-1">open</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
