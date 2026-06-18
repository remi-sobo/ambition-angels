import Link from "next/link";
import { getAcksDue } from "@/lib/admin/overview/sources";
import { money } from "../../finance/_components/charts";
import { Widget, Empty } from "./shared";

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Acknowledgments due — gifts awaiting a thank-you, oldest first. Gifts ≥ $250
// carry the IRS substantiation flag.

export default async function AcksDueWidget({ className }: { className?: string }) {
  const { rows, total, totalValue } = await getAcksDue();

  return (
    <Widget title="Acknowledgments due" href="/admin/fundraising/acknowledgments" hrefLabel="Acknowledgments" className={className}>
      {total === 0 ? (
        <Empty>All caught up — no pending thank-yous.</Empty>
      ) : (
        <>
          <div className="mb-3 text-xs text-ink-2">
            <span className="font-semibold text-ink-1">{total}</span> pending · {money(totalValue)}
          </div>
          <ul className="divide-y divide-hairline -my-1">
            {rows.slice(0, 8).map((a) => (
              <li key={a.id} className="py-2.5 flex items-center gap-3">
                <Link href={a.href} className="font-medium text-ink-1 hover:text-orange transition-colors truncate min-w-0 flex-1">
                  {a.donor}
                </Link>
                {a.irs && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange/15 text-orange whitespace-nowrap">
                    IRS ≥$250
                  </span>
                )}
                <span className="text-sm text-ink-1 font-semibold [font-variant-numeric:tabular-nums] whitespace-nowrap">
                  {money(a.amount)}
                </span>
                <span className="text-[11px] text-ink-3 whitespace-nowrap w-12 text-right">{fmtDate(a.giftDate)}</span>
              </li>
            ))}
            {total > 8 && <li className="py-2 text-[11px] text-ink-3">+{total - 8} more</li>}
          </ul>
        </>
      )}
    </Widget>
  );
}
