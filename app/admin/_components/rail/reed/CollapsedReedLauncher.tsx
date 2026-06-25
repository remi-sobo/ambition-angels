"use client";

import { useReed } from "./ReedProvider";

/**
 * The minimal always-on Reed launcher shown when the rail is collapsed (rendered
 * by RailShell only in its collapsed state). Sits where the retired FAB was;
 * tapping it summons Reed. xl-only — below the breakpoint the rail is hidden and
 * the mobile quick-add button still carries capture.
 */
export default function CollapsedReedLauncher() {
  const { summon } = useReed();
  return (
    <button
      onClick={() => summon()}
      aria-label="Open Reed"
      className="hidden xl:flex fixed right-6 bottom-6 z-30 items-center gap-1.5 rounded-full bg-navy text-cream shadow-xl pl-3.5 pr-4 py-2.5 text-sm font-semibold hover:bg-navy-light transition-colors active:scale-95"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2z" />
      </svg>
      Reed
    </button>
  );
}
