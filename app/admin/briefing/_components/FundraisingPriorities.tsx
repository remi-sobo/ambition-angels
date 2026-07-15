import Link from "next/link";
import { money } from "../../finance/_components/charts";
import type { FundraisingMove } from "@/lib/admin/briefing/fundraising";
import { TYPE } from "@/lib/admin/typeScale";

// Today's fundraising priorities — the top AI-prioritized moves (with a
// deterministic fallback). Read-only: each row links to the donor to act; the
// full agent + apply flow lives on the Fundraising page.

const CHANNEL_STYLE: Record<string, string> = {
  email: "bg-blue-500/15 text-blue-400",
  call: "bg-orange/15 text-orange",
  meeting: "bg-revenue/15 text-revenue",
  note: "bg-tile text-ink-2 border border-outline",
  other: "bg-tile text-ink-3 border border-outline",
};

const fmtDue = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

export default function FundraisingPriorities({ moves }: { moves: FundraisingMove[] }) {
  if (moves.length === 0) return null;
  const hasAi = moves.some((m) => m.source === "ai");

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className={TYPE.cardTitle}>
          Today&apos;s fundraising moves
          <span className="text-ink-3 font-normal"> · {hasAi ? "AI-ranked" : "from your queue"}</span>
        </h2>
        <Link href="/admin/fundraising/today" className="text-[11px] font-semibold text-orange hover:text-orange-dark">
          Open in Fundraising →
        </Link>
      </div>

      <div className="space-y-2">
        {moves.map((m, i) => {
          const due = fmtDue(m.dueDate);
          const inner = (
            <>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-bold text-ink-3 tabular-nums">#{i + 1}</span>
                <span className="font-heading font-semibold text-[14px] text-ink-1">{m.name}</span>
                <span className="text-[11px] text-ink-3 capitalize">{m.stage}</span>
                {m.askAmount ? <span className="text-[11px] text-ink-3">· {money(Number(m.askAmount))}</span> : null}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${CHANNEL_STYLE[m.channel] ?? CHANNEL_STYLE.other}`}>
                  {m.channel}
                </span>
                {due && <span className="text-[11px] text-ink-3">· due {due}</span>}
              </div>
              <p className="text-sm text-ink-1 leading-snug">{m.action}</p>
              {m.rationale && <p className="text-xs text-ink-3 mt-0.5 leading-snug">{m.rationale}</p>}
            </>
          );
          return (
            <div key={m.id} className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel px-4 py-3">
              {m.constituentId ? (
                <Link href={`/admin/fundraising/donors/${m.constituentId}`} className="block group">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
