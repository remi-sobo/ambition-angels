"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * A navigation row in the espresso sidebar — Visual System V3 §7.
 *
 * The V3 note on the active state is precise, so it is worth restating:
 *
 *   "Active navigation should not rely on gradient, glow, heavy border,
 *    orange icon and left bar all simultaneously. Instead use: subtle
 *    warm-tinted background, 2-3px terracotta left indicator, brighter
 *    label/icon. That is enough."
 *
 * The previous row stacked all five signals — a 135° gradient, an inset ring,
 * a 14px orange drop shadow, a terracotta left bar AND a tinted icon. This
 * keeps exactly the three V3 names and drops the rest. Inactive rows stay
 * quiet, and the row is not a pill (§4) — it takes the control radius.
 *
 * §13: the active row also carries `aria-current="page"`, so the state does
 * not depend on the tint being perceivable.
 */
export default function SidebarItem({
  href,
  icon,
  label,
  active,
  badge,
  onNavigate,
}: {
  href: string;
  icon?: ReactNode;
  label: ReactNode;
  active: boolean;
  /** Unread count — one of V3's sanctioned pills. */
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={[
        "relative flex items-center gap-3 pl-3 pr-2.5 py-2 rounded-control transition-colors",
        TYPE.nav,
        active
          ? // 1. subtle warm-tinted background  2. terracotta left indicator
            // 3. brighter label. Nothing else.
            "bg-[color:var(--bg-sidebar-raised)] text-[color:var(--sidebar-text)] font-semibold before:content-[''] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-full before:bg-accent"
          : "text-[color:var(--sidebar-muted)] hover:text-[color:var(--sidebar-text)] hover:bg-white/[0.04]",
      ].join(" ")}
    >
      {icon ? (
        <span
          className={`shrink-0 ${active ? "text-[color:var(--sidebar-text)]" : "text-[color:var(--sidebar-muted)]"}`}
        >
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span
          className="ml-auto shrink-0 min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-accent text-white text-xs font-semibold leading-none tabular-nums"
          aria-label={`${badge} unread`}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}
