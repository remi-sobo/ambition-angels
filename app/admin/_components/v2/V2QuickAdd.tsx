"use client";

import { useEffect, useState, type ReactNode } from "react";
import QuickAddModal from "../QuickAddModal";
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
}: {
  currentUser: AdminUser | null;
  reedEnabled: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"task" | "report" | null>(null);
  const { open: openReed } = useReedLauncher();

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
      {menuOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 cursor-default hidden lg:block"
        />
      )}

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
      className="flex items-center gap-2 rounded-full border border-white/10 bg-navy px-4 py-2.5 text-[13px] font-heading font-semibold text-cream shadow-xl transition-colors hover:bg-[#1a2c5e] active:scale-[0.98]"
    >
      <span className="flex h-5 w-5 items-center justify-center">{children}</span>
      {label}
      {kbd && <kbd className="ml-1 text-[10px] font-medium border border-white/10 rounded px-1.5 py-0.5 text-cream/60">{kbd}</kbd>}
    </button>
  );
}
