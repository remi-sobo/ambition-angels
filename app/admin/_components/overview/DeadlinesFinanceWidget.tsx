import Link from "next/link";
import { getDeadlinesFinance } from "@/lib/admin/overview/sources";
import { Widget, Empty } from "./shared";

// Deadlines + finance ops — grant requirements coming due and overdue pledge
// installments, soonest first.

export default async function DeadlinesFinanceWidget({
  title = "Deadlines & finance ops",
  className,
}: {
  title?: string;
  className?: string;
}) {
  const rows = await getDeadlinesFinance();

  return (
    <Widget title={title} href="/admin/fundraising/grants" hrefLabel="Grants" className={className}>
      {rows.length === 0 ? (
        <Empty>Nothing due in the next 30 days and no overdue installments.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={r.href} className="text-sm text-ink-1 font-medium truncate block hover:text-orange transition-colors">
                  {r.title}
                </Link>
                <div className="text-[11px] text-ink-2">{r.sub}</div>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  r.overdue ? "bg-expense-bg text-expense" : "bg-tile text-ink-2"
                }`}
              >
                {r.overdue ? "Overdue" : r.due}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
