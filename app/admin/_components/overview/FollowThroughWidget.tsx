import Link from "next/link";
import { getFollowThrough } from "@/lib/admin/overview/sources";
import { money } from "../../finance/_components/charts";
import { Widget } from "./shared";

// Fundraising follow-through — what to chase: overdue moves, asks with no owner,
// and recent gifts to log and steward.

export default async function FollowThroughWidget({ className }: { className?: string }) {
  const f = await getFollowThrough();

  const cells = [
    {
      label: "Overdue moves",
      value: String(f.overdueMoves),
      tone: f.overdueMoves > 0 ? "text-expense" : "text-ink-1",
      href: "/admin/fundraising/today",
    },
    {
      label: "Asks with no owner",
      value: String(f.ownerlessAsks),
      tone: f.ownerlessAsks > 0 ? "text-orange" : "text-ink-1",
      href: "/admin/fundraising/today",
    },
    {
      label: "Recent gifts (14d)",
      value: String(f.recentGifts),
      tone: "text-ink-1",
      sub: f.recentGifts > 0 ? money(f.recentGiftsValue) : undefined,
      href: "/admin/fundraising/today",
    },
  ];

  return (
    <Widget title="Fundraising follow-through" href="/admin/fundraising/today" hrefLabel="Today's Moves" className={className}>
      <div className="grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <Link key={c.label} href={c.href} className="block rounded-card border border-outline bg-cream/40 p-3 hover:border-orange/40 transition-colors">
            <div className={`font-heading font-bold text-2xl [font-variant-numeric:tabular-nums] ${c.tone}`}>{c.value}</div>
            <div className="text-[11px] text-ink-2 mt-1 leading-tight">{c.label}</div>
            {c.sub && <div className="text-[11px] text-ink-3 mt-0.5">{c.sub}</div>}
          </Link>
        ))}
      </div>
    </Widget>
  );
}
