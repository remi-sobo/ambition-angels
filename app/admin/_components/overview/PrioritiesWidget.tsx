import Link from "next/link";
import { getPriorities } from "@/lib/admin/overview/sources";
import { todayISO } from "../../ops/_types/ops";
import { Widget, Empty } from "./shared";

// Dated tasks + grant requirement deadlines, soonest first — the operator's
// "what's due" lane (also surfaced to the CEO for deadline awareness).

export default async function PrioritiesWidget({ className }: { className?: string }) {
  const { rows, openTaskCount } = await getPriorities();
  const today = todayISO();

  return (
    <Widget title="Upcoming Priorities" href="/admin/ops" hrefLabel={`All tasks (${openTaskCount})`} className={className}>
      {rows.length === 0 ? (
        <Empty>
          {openTaskCount > 0
            ? `${openTaskCount} open task${openTaskCount === 1 ? "" : "s"}, none with a due date — set dates under Operations → Tasks to surface them here.`
            : "Nothing due — add tasks under Operations → Tasks."}
        </Empty>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((p) => {
            const overdue = p.due < today;
            const isToday = p.due === today;
            return (
              <li key={p.key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={p.href} className="text-sm text-ink-1 font-medium truncate block hover:text-orange transition-colors">
                    {p.title}
                  </Link>
                  <div className="text-[11px] text-ink-2 capitalize">{p.sub}</div>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    overdue ? "bg-expense-bg text-expense" : isToday ? "bg-orange/15 text-orange" : "bg-tile text-ink-2"
                  }`}
                >
                  {overdue ? "Overdue" : isToday ? "Today" : p.due}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}
