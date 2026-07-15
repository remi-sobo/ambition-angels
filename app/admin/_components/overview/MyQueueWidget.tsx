import Link from "next/link";
import { getQueueTasks } from "@/lib/admin/overview/sources";
import { todayISO } from "../../ops/_types/ops";
import { PriorityFlag } from "../../ops/_components/TaskRow";
import { Widget, Empty } from "./shared";

// Open tasks for one person, pinned-for-today first, then soonest due. Used as
// Shannon's "My queue" on the Ops panel and Remi's "My to-dos" on the cockpit.
// Compliance items assigned to the person fold in once due ≤30 days out and
// link back to /admin/compliance. (Connection backlog + email-triage
// candidates fold in here as those sources are wired.)

export default async function MyQueueWidget({
  assignee = "shannon",
  title = "My queue",
  href = "/admin/ops",
  className,
}: {
  assignee?: "remi" | "shannon";
  title?: string;
  href?: string;
  className?: string;
}) {
  const { tasks, total } = await getQueueTasks(assignee);
  const today = todayISO();

  return (
    <Widget title={title} href={href} hrefLabel={`All tasks (${total})`} className={className}>
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
                  <Link href={t.href ?? href} className="text-sm text-ink-1 font-medium truncate flex items-center gap-1 hover:text-orange transition-colors">
                    {t.pinnedToday && <span className="text-orange" aria-label="pinned for today">★</span>}
                    {t.priority === "urgent" && (
                      <span aria-label="urgent">
                        <PriorityFlag priority="urgent" />
                      </span>
                    )}
                    <span className="truncate">{t.title}</span>
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
