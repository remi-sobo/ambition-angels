"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Horizontal tabs for BloomOS — Visual System V3 §5.
 *
 * "Reduce the number of pill-shaped navigation elements. Main page tabs such
 * as Plan & Close / My Week / Tasks / Projects / Meetings / Documents should
 * become clean horizontal tabs. Use text, generous spacing, active font
 * weight, subtle terracotta underline or bottom border. Do not place every tab
 * inside a capsule."
 *
 * So: no capsule, no border, no background. An inactive tab is quiet text; the
 * active tab is heavier ink plus a 2px terracotta underline that sits ON the
 * container's bottom rule, which is what makes the row read as tabs rather
 * than as another button group.
 *
 * §13: the active tab is never signalled by color alone — weight and the
 * underline carry it too, and `aria-current="page"` carries it for AT.
 */

export type TabItem = {
  key: string;
  label: ReactNode;
  href: string;
  /** Optional count rendered as a quiet pill — one of V3's sanctioned pills. */
  count?: number;
};

export function TabLink({
  href,
  active,
  children,
  count,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        // -mb-px drops the underline onto the container rule.
        "shrink-0 inline-flex items-center gap-2 border-b-2 -mb-px px-1 py-3 transition-colors",
        TYPE.nav,
        active
          ? "border-accent text-ink-1 font-semibold"
          : "border-transparent text-ink-2 hover:text-ink-1 hover:border-outline",
      ].join(" ")}
    >
      <span>{children}</span>
      {count != null && count > 0 && (
        <span
          className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full ${
            active ? "bg-orange-light text-orange-dark" : "bg-tile text-ink-2"
          } text-xs font-semibold tabular-nums`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

export default function Tabs({
  items,
  isActive,
  label = "Tabs",
  className = "",
}: {
  items: TabItem[];
  isActive: (item: TabItem) => boolean;
  label?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      // flex-nowrap + overflow-x-auto: the row can never wrap to a second
      // line at any tenant's tab count (it just scrolls on narrow screens).
      className={`flex flex-nowrap items-center gap-6 overflow-x-auto border-b border-hairline ${className}`}
    >
      {items.map((t) => (
        <TabLink key={t.key} href={t.href} active={isActive(t)} count={t.count}>
          {t.label}
        </TabLink>
      ))}
    </nav>
  );
}
