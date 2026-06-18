import Link from "next/link";
import { getMyQueue } from "@/lib/admin/overview/sources";
import { todayISO } from "../../ops/_types/ops";
import { Widget, Empty } from "./shared";

// My queue — the operator's open tasks, pinned-for-today first, then soonest
// due. (Connection backlog + email-triage candidates fold in here as those
// sources are wired; for now this is the task plate.)

export default async function MyQueueWidget({ className }: { className?: string }) {
  const { tasks, total } = await getMyQueue();
  const today = todayISO();

  return (
    <Widget title="My queue" href="/admin/ops" hrefLabel={`All tasks (${total})`} className={className}>
      {tasks.length === 0 ? (
        <Empty>Nothing assigned and open — clear plate.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {tasks.slice(0, 8).map((t) => {
            const overdue = t.due != null && t.due < today;
            const isToday = t.due === today;
            return (
              <li key={t.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href="/admin/ops" className="text-sm text-ink-1 font-medium truncate block hover:text-orange transition-colors">
                    {t.pinnedToday && <span className="text-orange mr-1" aria-label="pinned for today">★</span>}
                    {t.title}
                  </Link>
                  {t.category && <div className="text-[11px] text-ink-2 capitalize">{t.category}</div>}
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    overdue ? "bg-expense-bg text-expense" : isToday ? "bg-orange/15 text-orange" : "bg-tile text-ink-2"
                  }`}
                >
                  {t.due == null ? "No date" : overdue ? "Overdue" : isToday ? "Today" : t.due}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}
