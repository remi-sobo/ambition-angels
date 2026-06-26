"use client";

import { useReedLauncher } from "@/app/admin/_components/reed/ReedLauncherProvider";

/**
 * "Start with Reed" — the from-scratch facilitation entry (Reed-for-strategy
 * Phase C), shown when the plan is empty. Reed walks the operator one level at a
 * time (mission → objectives → goals → measures), proposing INERT elements that
 * land in the Reed inbox to accept or refine. Reuses Phase B's propose tool and
 * Phase D's apply-on-accept. Self-gates on the launcher's entitlement.
 */
const START_PROMPT =
  "Let's build my strategic plan from scratch — facilitate it with me ONE LEVEL AT A TIME; don't dump a " +
  "whole tree. First call get_org_foundation_and_outcomes and the finance tools to ground us, and if our " +
  "mission/vision is missing or vague, ask me about it before proposing anything. Then propose just 2–3 " +
  "candidate objectives (three-year, outcome-focused) with propose_plan_element and stop — I'll accept or " +
  "refine them in the Reed inbox before we go further. After I've accepted objectives we'll add goals under " +
  "them, then a measurable KPI or two per goal. Keep each level focused and grounded in our mission and runway.";

export default function ReedStartButton() {
  const reed = useReedLauncher();
  if (!reed.enabled) return null;
  return (
    <button
      onClick={() => reed.open({ surface: "strategy", draft: START_PROMPT })}
      className="text-xs font-semibold text-white bg-navy hover:bg-[#19305f] px-4 py-2 rounded-full transition-colors inline-flex items-center gap-1.5"
    >
      <ReedMark className="w-3.5 h-3.5 text-orange-mid" />
      Start with Reed
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
