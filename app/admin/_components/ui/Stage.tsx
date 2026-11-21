"use client";

import type { ReactNode } from "react";
import { useFocusTrap } from "./useFocusTrap";

/**
 * Stage: the one full-screen surface (V4 Stage G). For a presentation that
 * must cover the shell (the Strategy Narrative's presenter mode), not for
 * forms: forms use <Drawer>, confirmations <Modal>.
 *
 * Covers the viewport on the app background, scrolls its own content, and
 * shares Drawer and Modal's focus trap, Escape to close and focus return.
 *
 * <Stage label="Presenter" onClose={exit}>…slides…</Stage>
 */
export default function Stage({
  label,
  onClose,
  children,
  className = "",
}: {
  /** Accessible name for the surface. */
  label: string;
  /** Escape (and any close control the caller renders) lands here. */
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className={`fixed inset-0 z-[100] bg-app overflow-y-auto focus:outline-none ${className}`}
    >
      {children}
    </div>
  );
}
