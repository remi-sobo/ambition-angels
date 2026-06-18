import Link from "next/link";
import { getStrategyRollup } from "@/lib/admin/overview/sources";
import { Widget, Empty } from "./shared";

// Strategy health — the four objective tiles and the OGSM review nudge, read
// from the cached rollup. Management by exception: red/amber objectives stand
// out, and the review nudge says when the monthly review is due.

const DOT: Record<string, string> = {
  behind: "bg-expense",
  at_risk: "bg-[#C8881B]",
  on_track: "bg-revenue",
  done: "bg-revenue",
  not_started: "bg-gray-mid",
};
const HEALTH_LABEL: Record<string, string> = {
  behind: "Behind",
  at_risk: "At risk",
  on_track: "On track",
  done: "Done",
  not_started: "Not started",
};

function reviewLine(nextReviewAt: string | null, lastReviewAt: string | null): { text: string; tone: string } {
  if (!nextReviewAt && !lastReviewAt) return { text: "No OGSM review logged yet", tone: "text-ink-2" };
  if (!nextReviewAt) return { text: "Next review not scheduled", tone: "text-ink-2" };
  const days = Math.floor((Date.parse(`${nextReviewAt}T00:00:00Z`) - Date.now()) / 86_400_000);
  if (days < 0) return { text: `Monthly review overdue by ${Math.abs(days)}d`, tone: "text-expense font-semibold" };
  if (days === 0) return { text: "Monthly review due today", tone: "text-[#A56A1B] font-semibold" };
  if (days <= 7) return { text: `Monthly review in ${days}d`, tone: "text-[#A56A1B]" };
  return { text: `Next review in ${days}d`, tone: "text-ink-2" };
}

export default async function StrategyHealthWidget({ className }: { className?: string }) {
  const { hasPlan, objectives, nextReviewAt, lastReviewAt } = await getStrategyRollup();
  const review = reviewLine(nextReviewAt, lastReviewAt);

  return (
    <Widget title="Strategy" href="/admin/strategic-plan" hrefLabel="Plan" className={className}>
      {!hasPlan ? (
        <Empty>
          No strategy yet — <Link href="/admin/strategic-plan" className="text-orange hover:underline">load the OGSM</Link> to see objective health here.
        </Empty>
      ) : (
        <>
          <ul className="space-y-2">
            {objectives.map((o) => (
              <li key={o.id} className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT[o.health] ?? "bg-gray-mid"}`} />
                <span className="text-sm text-ink-1 truncate min-w-0 flex-1">{o.title}</span>
                {o.kpisOffTrack > 0 && (
                  <span className="text-[10px] text-expense font-semibold tabular-nums flex-shrink-0">
                    {o.kpisOffTrack} off target
                  </span>
                )}
                <span className="text-[10px] text-ink-2 flex-shrink-0">{HEALTH_LABEL[o.health] ?? o.health}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-outline pt-3">
            <span className={`text-xs ${review.tone}`}>{review.text}</span>
            <Link href="/admin/strategic-plan/review" className="text-xs font-semibold text-orange hover:text-orange-mid whitespace-nowrap">
              Run review →
            </Link>
          </div>
        </>
      )}
    </Widget>
  );
}
