"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { TYPE } from "@/lib/site/ui/typeScale";
import { buttonClass, type ButtonSize } from "@/app/site-admin/_ui/ui/Button";

/**
 * The "More actions" overflow menu (spec §5: "Header (title, one primary
 * action, More actions)"; the ⋮ button in Main.dc.html and Donor.dc.html).
 *
 * Keyboard: Enter/Space/ArrowDown open it and focus the first item; Up/Down
 * move, Home/End jump, Escape closes and returns focus to the button, Tab
 * closes. A click outside closes it. Items are links (href) or actions
 * (onSelect); a `danger` item reads in danger text.
 *
 * V4 B2 options, all optional (defaults keep the header's ⋮ button):
 *  - `triggerText`  a text button ("Assign to…") instead of the icon;
 *  - `dots`         "horizontal" draws ⋯ (per-row menus, e.g. a gift);
 *  - `placement`    "above" opens upward (a sticky footer at the bottom);
 *  - `checked` on an item makes the menu a single choice (menuitemradio).
 */
export type MenuAction = {
  label: string;
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Set on every item to make a single-choice menu; true marks the current one. */
  checked?: boolean;
  /** A second, quieter line (e.g. why an item is disabled). */
  hint?: string;
};

export default function MoreActionsMenu({
  items,
  label = "More actions",
  size = "lg",
  align = "right",
  triggerText,
  dots = "vertical",
  placement = "below",
  disabled = false,
}: {
  items: MenuAction[];
  /** Accessible name for the icon-only trigger (and the menu). */
  label?: string;
  size?: ButtonSize;
  align?: "left" | "right";
  /** Visible trigger text; omit for the icon-only button. */
  triggerText?: string;
  dots?: "vertical" | "horizontal";
  placement?: "below" | "above";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  // The side the menu hangs from. Starts at `align`; flips when that side
  // would run off the viewport (a row menu on a phone, where actions sit left).
  const [side, setSide] = useState<"left" | "right">(align);
  const flipped = useRef(false);
  useLayoutEffect(() => {
    if (!open) {
      flipped.current = false;
      setSide(align);
      return;
    }
    if (flipped.current) return; // at most one flip per open
    const r = menuRef.current?.getBoundingClientRect();
    if (!r) return;
    if (side === "right" && r.left < 8) {
      flipped.current = true;
      setSide("left");
    } else if (side === "left" && r.right > window.innerWidth - 8) {
      flipped.current = true;
      setSide("right");
    }
  }, [open, align, side]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const enabled = () => itemRefs.current.filter((n): n is HTMLElement => !!n && n.getAttribute("aria-disabled") !== "true");

  function focusAt(index: number) {
    const list = enabled();
    if (list.length === 0) return;
    list[(index + list.length) % list.length].focus();
  }

  function openAndFocus(last = false) {
    setOpen(true);
    requestAnimationFrame(() => focusAt(last ? -1 : 0));
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onMenuKey(e: React.KeyboardEvent) {
    const list = enabled();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusAt(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusAt(-1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  const itemClass = (danger?: boolean) =>
    `flex w-full items-center min-h-[40px] px-3 rounded-control text-left ${TYPE.body} ${
      danger ? "!text-status-critical-text" : ""
    } hover:bg-tile focus-visible:bg-tile aria-disabled:opacity-50 aria-disabled:pointer-events-none`;

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        // A text trigger keeps the fuller label only when it starts with the
        // visible text (WCAG 2.5.3 label in name): "Change" → "Change owner…".
        aria-label={!triggerText || label.startsWith(triggerText.replace(/…$/, "")) ? label : undefined}
        aria-haspopup="menu"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : openAndFocus())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            openAndFocus();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            openAndFocus(true);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            close();
          }
        }}
        className={buttonClass({ variant: "secondary", size, iconOnly: !triggerText })}
      >
        {triggerText ? (
          <>
            {triggerText}
            <svg aria-hidden viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d={placement === "above" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor">
            {dots === "horizontal" ? (
              <>
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </>
            ) : (
              <>
                <circle cx="12" cy="5" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="12" cy="19" r="1.8" />
              </>
            )}
          </svg>
        )}
      </button>
      {open ? (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`elevate-menu absolute ${placement === "above" ? "bottom-full mb-1" : "top-full mt-1"} z-40 min-w-[220px] max-h-[320px] overflow-y-auto p-1 bg-surface border border-outline rounded-control ${
            side === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item, i) => {
            const radio = item.checked !== undefined;
            const common = {
              role: radio ? "menuitemradio" : "menuitem",
              "aria-checked": radio ? item.checked : undefined,
              tabIndex: -1,
              "aria-disabled": item.disabled || undefined,
              className: itemClass(item.danger),
              ref: (n: HTMLElement | null) => {
                itemRefs.current[i] = n;
              },
            } as const;
            return item.href && !item.disabled ? (
              <Link key={`${i}-${item.label}`} href={item.href} {...common} onClick={() => close(false)}>
                <ItemText item={item} />
              </Link>
            ) : (
              <button
                key={`${i}-${item.label}`}
                type="button"
                {...common}
                onClick={() => {
                  if (item.disabled) return;
                  close();
                  item.onSelect?.();
                }}
              >
                <ItemText item={item} />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ItemText({ item }: { item: MenuAction }) {
  return (
    <span className="flex w-full items-center gap-2 py-1.5">
      {item.checked !== undefined ? (
        <span aria-hidden className="w-4 shrink-0 text-orange">
          {item.checked ? "✓" : ""}
        </span>
      ) : null}
      <span className="flex flex-col">
        <span>{item.label}</span>
        {item.hint ? <span className="text-xs text-ink-3">{item.hint}</span> : null}
      </span>
    </span>
  );
}
