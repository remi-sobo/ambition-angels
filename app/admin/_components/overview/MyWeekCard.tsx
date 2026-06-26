import Link from "next/link";
import { rhythmModeForToday } from "@/lib/admin/ops/rhythm";
import { formatDayLabel, todayInTZ } from "@/lib/admin/ops/week";

/**
 * The summon. A time-aware Command Center card that drops the user straight into
 * the right mode of the week (Operating Rhythm v2, Phase 2) — Mon–Wed it invites
 * the Plan, Thu–Sun the Close. Navigation (the "My Week" sidebar item → hub) is
 * the backup; this card is the adoption mechanism. Deterministic, no AI.
 *
 * Styled for the dark cockpit. Routes directly to the mode page; the wizard
 * replaces those targets in P3 without touching this card.
 */
export default function MyWeekCard() {
  const isPlan = rhythmModeForToday() === "monday_plan";
  const href = isPlan ? "/admin/ops/monday" : "/admin/ops/friday";
  const headline = isPlan ? "Plan your week" : "Close out your week";
  const blurb = isPlan
    ? "Place the week against the time you actually have."
    : "Truth the week, roll the rest, clear your follow-ups.";

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-card border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] p-5 transition-colors"
    >
      <span
        className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange/15 text-orange-mid"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <rect x="4" y="6" width="16" height="14" rx="2" />
          <path d="M4 10.5h16M9 3.5V7M15 3.5V7" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-cream/40">
          {formatDayLabel(todayInTZ())} · My Week
        </div>
        <div className="mt-0.5 font-heading font-semibold text-cream text-lg leading-tight truncate">
          {headline}
        </div>
        <div className="text-[13px] text-cream/55 truncate">{blurb}</div>
      </div>
      <span className="shrink-0 text-sm font-medium text-orange-mid group-hover:text-orange inline-flex items-center gap-1">
        Start <span aria-hidden>→</span>
      </span>
    </Link>
  );
}
