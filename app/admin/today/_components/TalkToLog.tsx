"use client";

import { useState } from "react";
import Button from "../../_components/ui/Button";
import QuickAddModal from "../../_components/QuickAddModal";
import { openCapture } from "../../capture/_lib/openCapture";
import type { AdminUser } from "@/lib/admin/auth";

/**
 * Today's one primary action (spec §7: "The page's primary action is Talk to
 * log"). With ai.capture it opens the shell's one Capture modal; an org
 * without ai.capture keeps the existing quick add (Add a task). Capture is
 * never turned on from here.
 */
export default function TalkToLog({
  mode,
  currentUser,
  block = false,
}: {
  mode: "talk" | "quick_add";
  currentUser: AdminUser | null;
  /** Full width (the phone layout). */
  block?: boolean;
}) {
  const [quickAdd, setQuickAdd] = useState(false);
  const width = block ? "w-full" : "";
  if (mode === "talk") {
    return (
      <Button type="button" size="lg" className={width} onClick={() => openCapture()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        Talk to log
      </Button>
    );
  }
  return (
    <>
      <Button type="button" size="lg" className={width} onClick={() => setQuickAdd(true)}>
        Add a task
      </Button>
      {quickAdd && <QuickAddModal currentUser={currentUser} onClose={() => setQuickAdd(false)} />}
    </>
  );
}
