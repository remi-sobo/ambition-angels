"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The modal frame for BloomOS — Visual System V3 §4, §12, §13.
 *
 * §12 is the reason this component exists: "Use shadows primarily for modals,
 * dropdowns, floating menus, overlays, elevated panels." Cards across the
 * product gave their shadows up so that THIS reads as lifted. The elevation
 * comes from the shared `.elevate-modal` utility rather than a per-modal
 * `shadow-2xl`, so every overlay in the product sits at the same height.
 *
 * §13 behaviour, since a modal is where keyboard traps usually appear:
 *  - focus moves into the dialog on open and returns to the opener on close
 *  - Escape closes; the backdrop closes
 *  - `role="dialog" aria-modal` + a labelled title
 *  - background scroll is locked while open
 *
 * On phones it rises as a bottom sheet (rounded top corners, full width),
 * which is both the platform idiom and a much better touch target.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first focusable node inside the panel, or the panel itself.
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      // Keep Tab inside the dialog.
      const nodes = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const width =
    size === "sm" ? "sm:max-w-sm" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-md";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[#29241F]/50 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={`elevate-modal relative w-full ${width} bg-surface border border-hairline rounded-t-modal sm:rounded-modal max-h-[92vh] flex flex-col focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-hairline">
          <div className="min-w-0">
            <h2 className={TYPE.modalTitle}>{title}</h2>
            {description ? (
              <p className={`${TYPE.metadata} mt-1`}>{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 -mr-1 -mt-1 w-8 h-8 inline-flex items-center justify-center rounded-control text-ink-2 hover:text-ink-1 hover:bg-tile transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-hairline">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
