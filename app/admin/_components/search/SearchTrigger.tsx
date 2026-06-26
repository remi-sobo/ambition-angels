"use client";

import { useEffect, useState } from "react";

/**
 * Sidebar search affordance — looks like an input, behaves like a button.
 * Sits at the top of the sidebar (above the Command Center section). Opening
 * the actual overlay is delegated to GlobalSearch (mounted in the layout) via
 * a window event, so the heavy palette JS only runs once summoned.
 */
export default function SearchTrigger() {
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent));
  }, []);

  const open = () => window.dispatchEvent(new CustomEvent("bloomos:search:open"));

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search BloomOS"
      aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-[#9c8b70] hover:text-cream hover:bg-white/[0.06] hover:border-white/20 transition-colors"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4 shrink-0"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span className="flex-1 text-left text-[13px]">Search…</span>
      <kbd className="shrink-0 text-[10px] font-medium border border-white/10 rounded px-1.5 py-0.5">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
