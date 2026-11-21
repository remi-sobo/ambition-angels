"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import { buttonClass, type ButtonSize } from "./Button";

/**
 * The "More actions" overflow menu (spec §5: "Header (title, one primary
 * action, More actions)"; the ⋮ button in Main.dc.html and Donor.dc.html).
 *
 * Keyboard: Enter/Space/ArrowDown open it and focus the first item; Up/Down
 * move, Home/End jump, Escape closes and returns focus to the button, Tab
 * closes. A click outside closes it. Items are links (href) or actions
 * (onSelect); a `danger` item reads in danger text.
 */
export type MenuAction = {
  label: string;
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export default function MoreActionsMenu({
  items,
  label = "More actions",
  size = "lg",
  align = "right",
}: {
  items: MenuAction[];
  /** Accessible name for the icon-only trigger. */
  label?: string;
  size?: ButtonSize;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const menuId = useId();

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
        aria-label={label}
        aria-haspopup="menu"
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
          }
        }}
        className={buttonClass({ variant: "secondary", size, iconOnly: true })}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`elevate-menu absolute top-full mt-1 z-40 min-w-[220px] p-1 bg-surface border border-outline rounded-control ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item, i) => {
            const common = {
              role: "menuitem",
              tabIndex: -1,
              "aria-disabled": item.disabled || undefined,
              className: itemClass(item.danger),
              ref: (n: HTMLElement | null) => {
                itemRefs.current[i] = n;
              },
            } as const;
            return item.href && !item.disabled ? (
              <Link key={item.label} href={item.href} {...common} onClick={() => close(false)}>
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                {...common}
                onClick={() => {
                  if (item.disabled) return;
                  close();
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
