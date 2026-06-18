import { getRecentDonations, type DonationRow } from "@/lib/admin/overview/sources";
import { money } from "../../finance/_components/charts";
import { Widget, Empty, timeAgo } from "./shared";

// Most recent gifts — stewardship awareness for the operator.

const donorName = (x: DonationRow) =>
  [x.first_name, x.last_name].filter(Boolean).join(" ") || x.name || x.email || "Anonymous";

export default async function RecentDonationsWidget({ className }: { className?: string }) {
  const donations = await getRecentDonations();

  return (
    <Widget title="Recent Donations" href="/admin/legacy" hrefLabel="Full history" className={className}>
      {donations.length === 0 ? (
        <Empty>No donations recorded yet.</Empty>
      ) : (
        <ul className="space-y-1">
          {donations.slice(0, 5).map((x, i) => (
            <li key={i} className="flex items-center gap-3 py-1.5">
              <div className="w-8 h-8 rounded-full bg-orange/10 border border-orange/20 flex items-center justify-center flex-shrink-0">
                <span className="text-orange font-bold text-xs">{donorName(x)[0]?.toUpperCase() ?? "$"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-ink-1 font-medium truncate block">{donorName(x)}</span>
                <span className="text-[11px] text-ink-2">{timeAgo(x.created_at)}</span>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-ink-1 [font-variant-numeric:tabular-nums]">{money(x.amount)}</div>
                {x.recurring && <div className="text-[10px] text-orange font-semibold">Monthly</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
