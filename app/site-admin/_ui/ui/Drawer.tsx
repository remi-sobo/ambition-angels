"use client";

import { useId, type ReactNode } from "react";
import { TYPE } from "@/lib/site/ui/typeScale";
import { useFocusTrap } from "@/app/site-admin/_ui/ui/useFocusTrap";

/**
 * The one drawer for BloomOS (spec §5 "Form: a drawer over the page for
 * anything under about ten fields"; GiftFlow.dc.html).
 *
 * Desktop: a 480px panel on the right, inset 10px from the edges with the
 * 18px modal radius, over a scrim. Under 640px it becomes a bottom sheet
 * (full width, rounded top corners, up to 92% of the screen), the same phone
 * form as <Modal>.
 *
 * Header (title, optional description, close), a scrolling body, and a
 * pinned footer for the actions, so "Save" never scrolls out of reach.
 * Focus trap, Escape, scrim click, scroll lock and focus return come from
 * useFocusTrap, shared with Modal.
 *
 * <Drawer open={open} onClose={close} title="Record a gift"
 *         description="Only amount and date are required."
 *         footer={<><Button variant="secondary">Save gift only</Button><Button>Save</Button></>}>
 *   …fields…
 * </Drawer>
 */
export default function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  width = 480,
  side = "right",
  bare = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Pinned action row. Put the one primary button last. */
  footer?: ReactNode;
  children: ReactNode;
  /** Desktop width in px. 480 is the standard; change it only with a reason. */
  width?: 480 | 560 | 760;
  /** "left" is the phone navigation panel: full height from the left edge
   *  at every width, never a bottom sheet. */
  side?: "right" | "left";
  /** No header or footer chrome: the children fill the panel and draw their
   *  own (the navigation panel, which carries the sidebar's own surface).
   *  The title stays as the accessible name, visually hidden. */
  bare?: boolean;
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(open, onClose);
  const uid = useId();
  const titleId = `drawer-title-${uid}`;
  const descId = `drawer-desc-${uid}`;

  if (!open) return null;

  const widthClass = width === 760 ? "sm:w-[760px]" : width === 560 ? "sm:w-[560px]" : "sm:w-[480px]";
  const frame =
    side === "left"
      ? "fixed inset-0 z-50 flex items-stretch justify-start"
      : "fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end";
  const panel =
    side === "left"
      ? "relative flex flex-col h-full w-72 max-w-[85vw] overflow-hidden focus:outline-none"
      : `elevate-modal relative flex flex-col w-full max-h-[92vh] bg-surface border border-outline rounded-t-modal sm:rounded-modal sm:max-h-none sm:m-2.5 ${widthClass} focus:outline-none`;

  return (
    <div className={frame}>
      {/* The scrim: the sidebar espresso at 56%, as in GiftFlow.dc.html. */}
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-navy/[0.56]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={panel}
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
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-hairline">
          <div className="min-w-0">
            <h2 id={titleId} className={TYPE.sectionTitle}>
              {title}
            </h2>
            {description ? (
              <p id={descId} className={`${TYPE.bodyMuted} mt-0.5`}>
                {description}
              </p>
            ) : null}
          </div>
          <CloseButton onClose={onClose} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>

        {footer ? (
          <div className="flex flex-wrap items-center gap-2 px-6 pt-4 pb-5 border-t border-hairline [&>*:last-child]:flex-1 sm:[&>*:last-child]:flex-none sm:justify-end">
            {footer}
          </div>
        ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** The 36px bordered close control shared by Drawer and Modal. */
export function CloseButton({ onClose, label = "Close" }: { onClose: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-control bg-surface border border-outline text-ink-1 hover:bg-tile transition-colors"
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
