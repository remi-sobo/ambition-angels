import Link from "next/link";
import { getMoves } from "@/lib/admin/overview/sources";
import { money } from "../../finance/_components/charts";
import { Widget, Empty } from "./shared";

// Moves only you can make: open asks owned by Remi or ≥ $10k whose next step is
// missing or overdue, biggest ask first.

export default async function MovesOnlyYouWidget({
  title = "Moves only you can make",
  className,
}: {
  title?: string;
  className?: string;
}) {
  const moves = await getMoves();
  const shown = moves.slice(0, 8);

  return (
    <Widget title={title} href="/admin/fundraising/today" hrefLabel="Today's Moves" className={className}>
      {moves.length === 0 ? (
        <Empty>No high-stakes asks need you right now — every owned or $10k+ ask has a current next step.</Empty>
      ) : (
        <ul className="divide-y divide-hairline -my-1">
          {shown.map((m) => (
            <li key={m.id} className="py-2.5 flex items-center gap-3">
              <Link href={m.href} className="font-medium text-ink-1 hover:text-orange transition-colors truncate min-w-0 flex-1">
                {m.name}
              </Link>
              {m.askAmount != null && (
                <span className="text-sm text-ink-1 font-semibold [font-variant-numeric:tabular-nums] whitespace-nowrap">
                  {money(m.askAmount)}
                </span>
              )}
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  m.reason === "overdue" ? "bg-expense-bg text-expense" : "bg-orange/15 text-orange"
                }`}
              >
                {m.reason === "overdue" ? "Step overdue" : "No next step"}
              </span>
            </li>
          ))}
          {moves.length > shown.length && (
            <li className="py-2 text-[11px] text-ink-3">+{moves.length - shown.length} more</li>
          )}
        </ul>
      )}
    </Widget>
  );
}
