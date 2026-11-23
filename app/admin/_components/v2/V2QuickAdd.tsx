"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import QuickAddModal from "../QuickAddModal";
import { openCapture } from "../../capture/_lib/openCapture";
import ReportModal from "../ReportModal";
import { useReedLauncher } from "../reed/ReedLauncherProvider";
import { ReedMark } from "../reed/ReedPanel";
import type { AdminUser } from "@/lib/admin/auth";

/**
 * Spec B, stage B6 — the V2 shell's Quick Add (desktop, `hidden lg:flex`).
 *
 * The V2 chrome has no right rail (its capture jobs consolidate here and in
 * the Reed panel), so this one FAB is the desktop capture affordance at every
 * width from lg up: Add task, Report an issue (the preservation gate's
 * shell-level trigger — destination-independent, origin_path captured by the
 * modal), the search overlay, and Ask Reed behind ai.reed. Phones get the
 * same actions from the mobile bar's ＋ (B5).
 */
export default function V2QuickAdd({
  currentUser,
  reedEnabled,
  captureEnabled = false,
  storyEnabled = false,
}: {
  currentUser: AdminUser | null;
  reedEnabled: boolean;
  /** Record (Capture, C4) behind ai.capture. */
  captureEnabled?: boolean;
  /** V4 Stage D: Capture a story (modules.comms + comms.manage). */
  storyEnabled?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"task" | "report" | null>(null);
  const { open: openReed } = useReedLauncher();

  // A popover menu, not a dialog: Escape or a press anywhere outside the
  // menu and its button closes it (no full-screen click catcher).
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen]);

  const offset = {
    right: "max(1.5rem, env(safe-area-inset-right))",
    bottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))",
  };

  const act = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <>
      <div ref={boxRef}>
      {menuOpen && (
        <div
          className="fixed z-40 hidden lg:flex flex-col items-end gap-2"
          style={{ right: offset.right, bottom: "calc(max(1.5rem, env(safe-area-inset-bottom) + 1rem) + 4.25rem)" }}
        >
          {reedEnabled && (
            <Chip label="Ask Reed" onClick={act(() => openReed({ surface: "v2-quick-add" }))}>
              <ReedMark className="w-4 h-4 text-orange-mid" />
            </Chip>
          )}
          {captureEnabled && (
            <Chip label="Talk to log" onClick={act(() => openCapture())}>
              <MicGlyph />
            </Chip>
          )}
          {storyEnabled && (
            <Chip label="Capture a story" onClick={act(() => window.location.assign("/admin/comms/stories/new"))}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
                <path d="M5 4h11l3 3v13H5z" />
                <path d="M8 10h8M8 14h6" />
              </svg>
            </Chip>
          )}
          <Chip label="Search" kbd="⌘K" onClick={act(() => window.dispatchEvent(new CustomEvent("bloomos:search:open")))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Chip>
          <Chip label="Report an issue" onClick={act(() => setModal("report"))}>
            <span aria-hidden>🐞</span>
          </Chip>
          <Chip label="Add task" onClick={act(() => setModal("task"))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
              <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
              <path d="M8.5 12.5l2.5 2.5 4.5-5" />
            </svg>
          </Chip>
        </div>
      )}

      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Quick add"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`fixed z-40 hidden lg:flex w-14 h-14 rounded-full bg-orange hover:bg-orange-dark text-white shadow-2xl shadow-orange/30 items-center justify-center text-3xl font-light transition-transform active:scale-95 ${
          menuOpen ? "rotate-45" : ""
        }`}
        style={offset}
      >
        +
      </button>
      </div>

      {modal === "task" && <QuickAddModal currentUser={currentUser} onClose={() => setModal(null)} />}
      {modal === "report" && <ReportModal onClose={() => setModal(null)} />}
    </>
  );
}

function Chip({
  label,
  kbd,
  onClick,
  children,
}: {
  label: string;
  kbd?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-white/10 bg-navy px-4 py-2.5 text-sm font-heading font-semibold text-cream shadow-xl transition-colors hover:bg-navy-light active:scale-[0.98]"
    >
      <span className="flex h-5 w-5 items-center justify-center">{children}</span>
      {label}
      {kbd && <kbd className="ml-1 text-xs font-medium border border-white/10 rounded px-1.5 py-0.5 text-cream/60">{kbd}</kbd>}
    </button>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
