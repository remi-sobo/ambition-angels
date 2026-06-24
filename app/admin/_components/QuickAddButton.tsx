"use client";

import { useEffect, useState } from "react";
import QuickAddModal from "./QuickAddModal";
import ReportModal from "./ReportModal";
import type { AdminUser } from "@/lib/admin/auth";

/**
 * Floating + button. Lives in the admin layout so it's on every admin route.
 * Tapping it opens a small menu: Add task (the QuickAddModal) or Report an issue
 * (the ReportModal). The button is only mounted when the user is authed (the
 * layout gates that), so we never render the modals for logged-out visitors.
 */
export default function QuickAddButton({
  currentUser,
}: {
  currentUser: AdminUser | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"task" | "report" | null>(null);

  // Close the menu on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const fabOffset = {
    right: "max(1.5rem, env(safe-area-inset-right))",
    bottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))",
  };

  return (
    <>
      {/* Click-away overlay while the menu is open. */}
      {menuOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 cursor-default"
        />
      )}

      {/* The two action chips, anchored just above the FAB. */}
      {menuOpen && (
        <div
          className="fixed z-40 flex flex-col items-end gap-2"
          style={{ right: fabOffset.right, bottom: "calc(max(1.5rem, env(safe-area-inset-bottom) + 1rem) + 4.25rem)" }}
        >
          <MenuChip
            label="Report an issue"
            emoji="🐞"
            onClick={() => {
              setMenuOpen(false);
              setModal("report");
            }}
          />
          <MenuChip
            label="Add task"
            emoji="✓"
            onClick={() => {
              setMenuOpen(false);
              setModal("task");
            }}
          />
        </div>
      )}

      <button
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Quick actions"
        aria-expanded={menuOpen}
        className={`fixed z-40 w-14 h-14 rounded-full bg-orange hover:bg-orange-dark text-white shadow-2xl shadow-orange/30 flex items-center justify-center text-3xl font-light transition-transform active:scale-95 ${
          menuOpen ? "rotate-45" : ""
        }`}
        style={fabOffset}
      >
        +
      </button>

      {modal === "task" && (
        <QuickAddModal currentUser={currentUser} onClose={() => setModal(null)} />
      )}
      {modal === "report" && <ReportModal onClose={() => setModal(null)} />}
    </>
  );
}

function MenuChip({ label, emoji, onClick }: { label: string; emoji: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 bg-navy text-cream border border-white/10 shadow-xl rounded-full pl-3 pr-4 py-2.5 text-sm font-semibold hover:bg-[#32241A] transition-colors active:scale-95"
    >
      <span aria-hidden className="text-base leading-none">{emoji}</span>
      {label}
    </button>
  );
}
