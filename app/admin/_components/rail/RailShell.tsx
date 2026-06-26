"use client";

import { useState, type ReactNode } from "react";

/**
 * Persistent right-rail shell. Mounted in the admin layout so it survives
 * navigation. Collapse state is cookie-backed (read server-side in Rail.tsx),
 * so the default is correct on first paint — no hydration flash — and the last
 * choice is remembered across reloads.
 *
 * Desktop-first (xl+): below the breakpoint the rail is hidden to avoid crowding
 * sidebar + body + rail on a laptop. The collapsed Reed launcher / mobile entry
 * lands with Phase 3 (Reed). The capture dock is pinned via `footer`.
 */
export default function RailShell({
  defaultOpen,
  children,
  footer,
  collapsedLauncher,
}: {
  defaultOpen: boolean;
  children: ReactNode;
  /** Pinned to the bottom of the rail, below the scrolling shelves (capture). */
  footer?: ReactNode;
  /** Shown only while collapsed — the minimal always-on Reed launcher. */
  collapsedLauncher?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  function set(next: boolean) {
    setOpen(next);
    document.cookie = `bloomos_rail=${next ? "open" : "closed"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <>
      <aside
        aria-label="Capture and ask"
        className={[
          // Elevated warm panel: a brighter surface than the cream workspace,
          // with a crisp taupe edge + soft left shadow so it reads as its own
          // plane instead of melting into the body.
          "hidden xl:flex flex-col shrink-0 sticky top-0 h-screen bg-surface",
          "overflow-hidden transition-[width] duration-300 ease-out motion-reduce:transition-none",
          open
            ? "w-[336px] border-l border-outline shadow-[-8px_0_24px_rgba(60,40,20,0.07)]"
            : "w-0",
        ].join(" ")}
      >
        {/* Fixed-width inner column so content doesn't reflow as width animates. */}
        <div className="w-[336px] h-full flex flex-col">
          <header className="h-12 flex items-center justify-between px-5 border-b border-outline flex-shrink-0">
            <span className="flex items-center gap-2 text-[10px] font-heading font-semibold uppercase tracking-[0.14em] text-ink-3">
              <span className="w-[3px] h-3 rounded-full bg-orange" aria-hidden />
              Today
            </span>
            <button
              onClick={() => set(false)}
              aria-label="Collapse rail"
              className="text-ink-3 hover:text-ink-1 transition-colors p-1 -mr-1"
            >
              <Chevron dir="right" />
            </button>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
          {footer && <div className="flex-shrink-0">{footer}</div>}
        </div>
      </aside>

      {/* When collapsed: an edge tab to reopen the rail (vertically centered, so
          it never collides with the Reed launcher), plus the always-on Reed
          launcher itself. */}
      {!open && (
        <>
          <button
            onClick={() => set(true)}
            aria-label="Open rail"
            className="hidden xl:flex fixed right-0 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-6 h-16 rounded-l-card bg-surface border border-r-0 border-hairline shadow-panel text-ink-3 hover:text-ink-1 hover:bg-tile transition-colors"
          >
            <Chevron dir="left" />
          </button>
          {collapsedLauncher}
        </>
      )}
    </>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points={dir === "right" ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
    </svg>
  );
}
