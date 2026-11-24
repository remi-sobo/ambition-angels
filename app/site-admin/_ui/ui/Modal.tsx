"use client";

import { useId, type ReactNode } from "react";
import { TYPE } from "@/lib/site/ui/typeScale";
import { useFocusTrap } from "@/app/site-admin/_ui/ui/useFocusTrap";
import { CloseButton } from "@/app/site-admin/_ui/ui/Drawer";

/**
 * The modal frame for BloomOS: Visual System V3 §4, §12, §13, matched to the
 * V4 Drawer (spec §6: "Drawer and Modal: one of each, with focus trap,
 * Escape, and a phone sheet form").
 *
 * Behaviour is shared with <Drawer> through useFocusTrap:
 *  - focus moves into the dialog on open and returns to the opener on close
 *  - Tab stays inside; Escape closes; the scrim closes
 *  - `role="dialog" aria-modal`, labelled by its title element (works for
 *    JSX titles too, not only strings)
 *  - background scroll is locked while open
 *
 * On phones (under 640px) it rises as a bottom sheet, as the Drawer does.
 * Use a Modal for a short decision or a small form that is not about the
 * page behind it; use a Drawer for a form that is.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md",
  layer = "base",
  bare = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  /** The body. A bare confirm (title, description, footer) can pass null. */
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  /** "top" stacks above drawers and other modals (the shared confirm). */
  layer?: "base" | "top";
  /** No header, padding or footer: the children fill the panel, which sits
   *  near the top of the screen on desktop. For a command surface (global
   *  search) that draws its own field. The title stays as the accessible
   *  name, visually hidden. */
  bare?: boolean;
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(open, onClose);
  const uid = useId();
  const titleId = `modal-title-${uid}`;
  const descId = `modal-desc-${uid}`;

  if (!open) return null;

  const width = size === "sm" ? "sm:max-w-sm" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-md";

  return (
    <div
      className={`fixed inset-0 ${layer === "top" ? "z-[80]" : "z-50"} flex items-end justify-center sm:p-4 ${
        bare ? "sm:items-start sm:pt-[12vh]" : "sm:items-center"
      }`}
    >
      {/* Same scrim as Drawer: sidebar espresso at 56%. */}
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-navy/[0.56]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`elevate-modal relative w-full ${width} bg-surface border border-outline rounded-t-modal sm:rounded-modal ${
          bare ? "max-h-[85vh] sm:max-h-[70vh] overflow-hidden" : "max-h-[92vh]"
        } flex flex-col focus:outline-none`}
      >
        {bare ? (
          <>
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
            {children}
          </>
        ) : (
          <>
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-hairline">
          <div className="min-w-0">
            <h2 id={titleId} className={TYPE.modalTitle}>
              {title}
            </h2>
            {description ? (
              <p id={descId} className={`${TYPE.metadata} mt-1`}>
                {description}
              </p>
            ) : null}
          </div>
          <CloseButton onClose={onClose} label="Close dialog" />
        </div>

        {children ? <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div> : null}

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-hairline">{footer}</div>
        ) : null}
          </>
        )}
      </div>
    </div>
  );
}
