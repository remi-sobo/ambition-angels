"use client";

import { useReedLauncher } from "@/app/admin/_components/reed/ReedLauncherProvider";

/**
 * "Review with Reed" — opens Reed pre-aimed at a strategy coherence review
 * (Reed-for-strategy Phase A) via the shared launcher. Reed reads the OGSM tree
 * + finance + mission, runs the deterministic coherence checks, then adds
 * judgment. Read-only — it critiques and (later) proposes, it never edits the
 * plan. Self-gates on the launcher's entitlement, so it renders nothing when
 * ai.reed is off.
 */
const REVIEW_PROMPT =
  "Review my strategic plan. Call get_strategy_coherence first and lead with those structural " +
  "findings (orphaned goals, KPIs missing a target/owner/source, dangling initiatives, overdue " +
  "review, too many objectives) — they're authoritative. Then add your judgment: which KPIs are " +
  "vanity vs. outcome, whether the objectives serve our mission, and whether the targets are " +
  "realistic against our runway. Be specific and name the objectives, goals, and KPIs. Don't change " +
  "anything — this is a review.";

export default function ReedReviewButton() {
  const reed = useReedLauncher();
  if (!reed.enabled) return null;
  return (
    <button
      onClick={() => reed.open({ surface: "strategy", draft: REVIEW_PROMPT })}
      className="text-xs font-semibold text-white bg-navy hover:bg-[#19305f] px-4 py-2 rounded-full transition-colors inline-flex items-center gap-1.5"
    >
      <ReedMark className="w-3.5 h-3.5 text-orange-mid" />
      Review with Reed
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
