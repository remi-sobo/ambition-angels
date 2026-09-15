import Link from "next/link";
import { getNeedsYou } from "@/lib/admin/rail/needs-you";
import { countStaleKpis } from "@/lib/admin/ops/nudges";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Step of the Friday Close: log the touches + check the numbers (light). The
 * overdue fundraising move and a stale-KPI count, each a link-out to where the
 * work actually happens. No inline CRM, no inline metric entry — this step
 * points, it doesn't edit.
 */
export default async function FridayNudges({ orgId }: { orgId: string | null }) {
  const [needs, staleKpis] = await Promise.all([
    getNeedsYou().catch(() => ({ overdue: [], today: [], nextTouch: null as null })),
    countStaleKpis(orgId),
  ]);
  const touch = needs.nextTouch;
  const overdueCount = needs.overdue.length;

  return (
    <section className="rounded-panel border-hairline bg-surface p-6 space-y-4">
      <div>
        <h2 className={TYPE.sectionHeader}>Touches &amp; numbers</h2>
        <p className="text-sm text-ink-2 mt-1">A quick look before you close. Act where it matters.</p>
      </div>

      {/* Fundraising follow-through */}
      <div className="rounded-control border-hairline bg-tile/40 p-4">
        <div className="text-xs uppercase tracking-wider text-ink-3 mb-1.5">Fundraising</div>
        {touch ? (
          <Link
            href={touch.href}
            className="flex items-center gap-2 text-sm text-ink-1 hover:text-orange group"
          >
            <span className="truncate">
              <span className="font-medium">{touch.name}</span>
              <span className="text-ink-2">, {touch.action}</span>
            </span>
            <span className="ml-auto shrink-0 text-xs font-mono text-expense">{touch.weight}</span>
            <span className="shrink-0 text-orange opacity-0 group-hover:opacity-100">→</span>
          </Link>
        ) : (
          <p className="text-sm text-revenue">Follow-through is clear. No overdue moves.</p>
        )}
        {overdueCount > 0 && (
          <Link
            href="/admin/ops"
            className="mt-2 inline-block text-xs text-ink-2 hover:text-orange"
          >
            {overdueCount} overdue task{overdueCount === 1 ? "" : "s"} assigned to you →
          </Link>
        )}
      </div>

      {/* Stale numbers */}
      <div className="rounded-control border-hairline bg-tile/40 p-4">
        <div className="text-xs uppercase tracking-wider text-ink-3 mb-1.5">Numbers</div>
        {staleKpis > 0 ? (
          <Link
            href="/admin/kpis"
            className="flex items-center gap-2 text-sm text-ink-1 hover:text-orange group"
          >
            <span>
              <span className="font-semibold text-status-watch-text">{staleKpis}</span> number
              {staleKpis === 1 ? " is" : "s are"} stale past their cadence
            </span>
            <span className="ml-auto shrink-0 text-orange opacity-0 group-hover:opacity-100">→</span>
          </Link>
        ) : (
          <p className="text-sm text-revenue">Metrics are current.</p>
        )}
      </div>
    </section>
  );
}
