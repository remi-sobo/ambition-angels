"use client";

import { useReedLauncher } from "@/app/admin/_components/reed/ReedLauncherProvider";

/**
 * "Build with Reed" — opens Reed pre-aimed at design mode (Reed-for-strategy
 * Phase B). Reed proposes the missing OGSM pieces as INERT proposals you accept
 * or dismiss in the Reed inbox; nothing writes the plan (applying is Phase D).
 * Self-gates on the launcher's entitlement.
 */
const DESIGN_PROMPT =
  "Help me strengthen this plan. Call get_strategy_coherence and get_strategy_plan first, then use " +
  "propose_plan_element to propose the missing pieces the coherence check flags — goals with no KPI, " +
  "objectives with no goal, unmeasurable KPIs — each laddered to the right parent (use the ids from " +
  "get_strategy_plan) and grounded in our mission and runway. Propose a few sharp elements, not a " +
  "flood. They're inert proposals I'll accept or dismiss — don't change the plan.";

export default function ReedDesignButton() {
  const reed = useReedLauncher();
  if (!reed.enabled) return null;
  return (
    <button
      onClick={() => reed.open({ surface: "strategy", draft: DESIGN_PROMPT })}
      className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] px-4 py-2 rounded-full transition-colors inline-flex items-center gap-1.5"
    >
      <ReedMark className="w-3.5 h-3.5 text-navy" />
      Build with Reed
    </button>
  );
}

function ReedMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7z" />
    </svg>
  );
}
