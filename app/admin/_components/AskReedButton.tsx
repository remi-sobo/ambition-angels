"use client";

import { useReedLauncher } from "./reed/ReedLauncherProvider";
import { ReedMark } from "./reed/ReedPanel";

/**
 * "Ask Reed" FAB — Reed's summon point on mobile (`xl:hidden`). On xl+ the right
 * rail carries Reed (its capture-to-Reed escalation opens the same drawer), so
 * the FAB would only overlap the rail; below the rail's breakpoint this is the
 * entry point. Mounted only when the org holds `ai.reed` (layout gate); the real
 * boundary is /api/reed/ask's server-side entitlement check.
 *
 * Sits to the left of the QuickAdd "+" FAB so the two don't collide on mobile.
 */
export default function AskReedButton() {
  const { open } = useReedLauncher();

  const fabOffset = {
    right: "max(calc(1.5rem + 4rem), calc(env(safe-area-inset-right) + 4rem))",
    bottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))",
  };

  return (
    <button
      onClick={() => open({ surface: "fab" })}
      aria-label="Ask Reed"
      aria-haspopup="dialog"
      className="fixed z-40 hidden lg:flex xl:hidden w-14 h-14 rounded-full bg-navy hover:bg-[#19305f] text-white shadow-2xl shadow-navy/30 items-center justify-center transition-transform active:scale-95"
      style={fabOffset}
    >
      <ReedMark className="w-6 h-6 text-orange-mid" />
    </button>
  );
}
