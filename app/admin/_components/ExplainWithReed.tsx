"use client";

import { useReedLauncher } from "./reed/ReedLauncherProvider";
import { ReedMark } from "./reed/ReedPanel";

/**
 * "Explain" entry point (spec #6, Phase 2) — a one-click affordance that opens
 * the Reed panel pre-filled with a grounded question about a deterministic
 * surface (the status line, an outlook window). UI sugar only: it rides the
 * shared launcher and the existing /api/reed/ask loop, where the spine read
 * tools ground the answer. The question is a DRAFT — the user sees it in the
 * input and presses send; nothing fires on click.
 *
 * Renders nothing when the org doesn't hold `ai.reed` (launcher disabled), so
 * the affordance never dangles on un-entitled tenants. Deliberately only two
 * call sites (decision E): StatusLineCard and OutlookPanel.
 */
export default function ExplainWithReed({
  question,
  surface,
  label = "Explain",
}: {
  question: string;
  surface: string;
  label?: string;
}) {
  const { enabled, open } = useReedLauncher();
  if (!enabled) return null;

  return (
    <button
      type="button"
      onClick={() => open({ draft: question, surface })}
      aria-haspopup="dialog"
      className="inline-flex items-center gap-1 rounded-full border border-outline bg-tile px-2 py-0.5 text-[11px] font-semibold text-ink-2 hover:text-ink-1 hover:border-orange/50 transition-colors shrink-0"
    >
      <ReedMark className="w-3 h-3 text-orange-mid" />
      {label}
    </button>
  );
}
