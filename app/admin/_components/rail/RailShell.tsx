"use client";

import { useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { TYPE } from "@/lib/admin/typeScale";

const RAIL_W = 336; // matches the open width below
const COMMIT_PX = 90; // horizontal travel needed to commit an open/close
const TAP_SLOP = 6; // movement under this reads as a tap, not a drag

/**
 * Persistent right-rail shell. Mounted in the admin layout so it survives
 * navigation. Collapse state is cookie-backed (read server-side in Rail.tsx),
 * so the default is correct on first paint — no hydration flash — and the last
 * choice is remembered across reloads.
 *
 * Desktop-first (xl+): below the breakpoint the rail is hidden to avoid crowding
 * sidebar + body + rail on a laptop. The collapsed Reed launcher / mobile entry
 * lands with Phase 3 (Reed). The capture dock is pinned via `footer`.
 *
 * Open/close is driven two ways: the chevron buttons (click + keyboard) and a
 * pointer swipe on the edges (mouse or finger). Grab the right edge and drag in
 * to open; grab the rail's inner edge and drag out to close — the width tracks
 * your pointer live, then snaps past a threshold on release.
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
  // While a swipe is in progress this holds the live rail width (px); null when
  // idle, which hands width back to the CSS class so the snap animates.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragging = dragWidth !== null;

  function set(next: boolean) {
    setOpen(next);
    document.cookie = `bloomos_rail=${next ? "open" : "closed"}; path=/; max-age=31536000; samesite=lax`;
  }

  // Shared swipe driver for both edges. `fromOpen` sets the starting width, so
  // the same math powers drag-to-open (start at 0) and drag-to-close (start at
  // full). Leftward travel widens; rightward narrows.
  function startDrag(e: ReactPointerEvent, fromOpen: boolean) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = fromOpen ? RAIL_W : 0;
    setDragWidth(startW);

    function move(ev: PointerEvent) {
      const next = startW + (startX - ev.clientX);
      setDragWidth(Math.max(0, Math.min(RAIL_W, next)));
    }
    function end(ev: PointerEvent) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragWidth(null);
      // A tap on either edge resolves to "open" (matching the old click tab);
      // tapping the close handle while already open is a harmless no-op.
      if (Math.abs(ev.clientX - startX) < TAP_SLOP) {
        set(true);
        return;
      }
      const travel = startX - ev.clientX; // + = dragged left (toward open)
      set(fromOpen ? travel > -COMMIT_PX : travel > COMMIT_PX);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  // Border + shadow read as a real surface whenever the rail has any width.
  const surfaced = dragging ? (dragWidth as number) > 0 : open;

  return (
    <>
      <aside
        aria-label="Capture and ask"
        className={[
          // The cockpit: a warm espresso plane against the cream workspace, with
          // a soft left shadow so it reads as its own surface. Dot-texture inside.
          "hidden xl:flex flex-col shrink-0 sticky top-0 h-screen bg-[#1F1811] text-[#EFE3D1] relative",
          "overflow-hidden",
          // No transition mid-drag — width must track the pointer 1:1; on release
          // the class width returns and this animates the snap.
          dragging ? "" : "transition-[width] duration-300 ease-out motion-reduce:transition-none",
          surfaced ? "border-l border-black/30 shadow-[-10px_0_30px_rgba(20,12,4,0.28)]" : "",
          dragging ? "" : open ? "w-[336px]" : "w-0",
        ]
          .filter(Boolean)
          .join(" ")}
        style={dragging ? { width: `${dragWidth}px` } : undefined}
      >
        {/* Fixed-width inner column so content doesn't reflow as width animates. */}
        <div
          className="w-[336px] h-full flex flex-col"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <header className="h-12 flex items-center justify-between px-5 border-b border-white/[0.07] flex-shrink-0">
            <span className={`flex items-center gap-2 ${TYPE.sectionHeader} !text-[#bfae93]`}>
              <span className="w-[3px] h-3 rounded-full bg-orange" aria-hidden />
              Today
            </span>
            <button
              onClick={() => set(false)}
              aria-label="Collapse rail"
              className="text-[#8d7c63] hover:text-[#EFE3D1] transition-colors p-1 -mr-1"
            >
              <Chevron dir="right" />
            </button>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
          {footer && <div className="flex-shrink-0">{footer}</div>}
        </div>

        {/* Swipe-to-close handle pinned to the rail's inner edge: drag it right
            to push the rail away. Drag-only — the header chevron handles clicks
            and keyboard. */}
        {open && !dragging && (
          <div
            onPointerDown={(e) => startDrag(e, true)}
            aria-hidden
            className="absolute left-0 top-0 h-full w-3 z-10 cursor-grab touch-none"
          />
        )}
      </aside>

      {/* When collapsed: a full-height swipe strip on the screen edge (drag in to
          open), the edge tab for clicks/keyboard, plus the always-on Reed
          launcher. */}
      {!open && (
        <>
          {!dragging && (
            <>
              <div
                onPointerDown={(e) => startDrag(e, false)}
                aria-hidden
                className="hidden xl:block fixed right-0 top-0 h-screen w-4 z-20 cursor-grab touch-none"
              />
              <button
                onClick={() => set(true)}
                aria-label="Open rail"
                className="hidden xl:flex fixed right-0 top-1/2 -translate-y-1/2 z-30 items-center justify-center w-6 h-16 rounded-l-card bg-surface border border-r-0 border-hairline shadow-panel text-ink-3 hover:text-ink-1 hover:bg-tile transition-colors"
              >
                <Chevron dir="left" />
              </button>
            </>
          )}
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
