"use client";

import { useReedLauncher } from "../reed/ReedLauncherProvider";

/**
 * Minimal always-on Reed launcher shown when the rail is collapsed (rendered by
 * RailShell only in its collapsed state). Opens the real Reed drawer. xl-only —
 * below the breakpoint the rail is hidden and the "Ask Reed" FAB is the entry.
 */
export default function CollapsedReedLauncher() {
  const { enabled, open } = useReedLauncher();
  if (!enabled) return null;
  return (
    <button
      onClick={() => open({ surface: "rail" })}
      aria-label="Open Reed"
      className="hidden xl:flex fixed right-6 bottom-6 z-30 items-center gap-1.5 rounded-full bg-navy text-cream shadow-xl pl-3.5 pr-4 py-2.5 text-sm font-semibold hover:bg-navy-light transition-colors active:scale-95"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7z" />
      </svg>
      Reed
    </button>
  );
}
