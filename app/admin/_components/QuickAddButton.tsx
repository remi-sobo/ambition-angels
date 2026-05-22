"use client";

import { useState } from "react";
import QuickAddModal from "./QuickAddModal";
import type { AdminUser } from "@/lib/admin/auth";

/**
 * Floating + button. Lives in the admin layout so it's on every admin
 * route. Clicking opens the QuickAddModal. The button is only mounted
 * when the user is authed (the layout gates that), so we never render
 * the modal for logged-out visitors.
 */
export default function QuickAddButton({
  currentUser,
}: {
  currentUser: AdminUser | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Quick-add task"
        className="fixed z-40 w-14 h-14 rounded-full bg-orange hover:bg-orange-dark text-white shadow-2xl shadow-orange/30 flex items-center justify-center text-3xl font-light transition-colors active:scale-95"
        style={{
          // Lift the FAB above the iOS home indicator when installed as a
          // PWA, and keep a sensible offset on regular browsers.
          right: "max(1.5rem, env(safe-area-inset-right))",
          bottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))",
        }}
      >
        +
      </button>
      {open && (
        <QuickAddModal currentUser={currentUser} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
