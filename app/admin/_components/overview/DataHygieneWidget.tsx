import Link from "next/link";
import { getDataHygiene } from "@/lib/admin/overview/sources";
import { Widget } from "./shared";

// Data hygiene — sync freshness + the things to clean. The stale-data alert
// lives HERE (not as a CEO fire): re-syncing is Shannon's actionable work.

const DOT: Record<string, string> = {
  fresh: "bg-revenue",
  watch: "bg-orange",
  stale: "bg-expense",
  untracked: "bg-gray-mid",
};

export default async function DataHygieneWidget({ className }: { className?: string }) {
  const h = await getDataHygiene();

  return (
    <Widget title="Data hygiene" className={className}>
      {h.staleHubspot && (
        <div className="mb-4 px-3 py-2 rounded-card bg-expense-bg border border-expense/30">
          <p className="text-xs font-semibold text-expense">HubSpot data is stale — re-sync before the numbers are trusted.</p>
          <Link href="/admin/fundraising" className="text-[11px] font-semibold text-expense underline">
            Run a sync →
          </Link>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {h.sync.map((s) => (
          <div key={s.source} className="flex items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[s.severity]}`} aria-hidden />
            <span className="text-ink-1 font-medium w-20">{s.source}</span>
            <span className="text-ink-2 text-xs">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-hairline space-y-2 text-sm">
        <Link href="/admin/fundraising/duplicates" className="flex items-center justify-between hover:text-orange transition-colors group">
          <span className="text-ink-2 group-hover:text-orange">Possible duplicate constituents</span>
          <span className="text-orange font-semibold">Review →</span>
        </Link>
        <Link href="/admin/fundraising" className="flex items-center justify-between hover:text-orange transition-colors group">
          <span className="text-ink-2 group-hover:text-orange">Unattributed gifts</span>
          <span className={`font-semibold ${h.unattributedGifts > 0 ? "text-expense" : "text-ink-3"}`}>
            {h.unattributedGifts}
          </span>
        </Link>
      </div>
    </Widget>
  );
}
