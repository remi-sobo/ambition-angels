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
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-orange hover:bg-orange-dark text-white shadow-2xl shadow-orange/30 flex items-center justify-center text-3xl font-light transition-colors"
      >
        +
      </button>
      {open && (
        <QuickAddModal currentUser={currentUser} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
