"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * The one focus-trap behaviour for every BloomOS overlay (Modal, Drawer, and
 * any later sheet): spec §6 "Drawer and Modal: one of each, with focus trap,
 * Escape, and a phone sheet form".
 *
 * While `active`:
 *  - focus moves into the panel (the first [data-autofocus] node, else the
 *    first focusable node, else the panel itself)
 *  - Tab and Shift+Tab cycle inside the panel
 *  - Escape calls onClose (and stops there, so a drawer inside a page with
 *    its own Escape handler does not close both)
 *  - background scroll is locked
 * When it deactivates, focus returns to whatever opened it.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (n) => n.getAttribute("aria-hidden") !== "true" && (n.offsetParent !== null || n === document.activeElement),
  );
}

// Open traps, innermost last. Only the innermost one answers keys, so a
// confirm raised from inside a drawer takes Escape and Tab without closing
// or stealing focus from the drawer underneath.
const openTraps: symbol[] = [];

export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onClose: () => void,
): RefObject<T> {
  const panelRef = useRef<T>(null);
  // Keep the latest onClose without re-running the effect (which would steal
  // focus back to the first field on every parent render).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const token = Symbol("trap");
    openTraps.push(token);
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    if (panel) {
      const preferred = panel.querySelector<HTMLElement>("[data-autofocus]");
      (preferred ?? focusableIn(panel)[0] ?? panel).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (openTraps[openTraps.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const nodes = focusableIn(panel);
      if (nodes.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      } else if (current && !panel.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const at = openTraps.indexOf(token);
      if (at >= 0) openTraps.splice(at, 1);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [active]);

  return panelRef;
}
