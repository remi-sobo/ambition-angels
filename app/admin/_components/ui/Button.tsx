import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The one button primitive for BloomOS — Visual System V3 §4.
 *
 * What changed from the pill era: buttons are no longer `rounded-full`. V3
 * reserves the 999px radius for statuses, filters, badges, tags and counts, so
 * a button now carries the 9px `control` radius and reads as a control rather
 * than a chip. Three real ranks (plus a destructive one), so a screen can say
 * which action is THE action:
 *
 *   primary    terracotta fill, white label       — one per view
 *   secondary  neutral surface + subtle border    — the common case
 *   ghost      text only                          — tertiary / inline
 *   danger     destructive, tinted not shouty
 *
 * Every variant clears WCAG AA: the `orange` token resolves to `--accent-ink`
 * (#9D532C), which is 5.16:1 as text on the workspace and 5.66:1 under white
 * as a fill. The vivid `--accent` (#C96B38) is fill-only and never sits behind
 * a label — see the token note in app/globals.css.
 *
 * <Button>Save</Button>
 * <Button variant="secondary">Cancel</Button>
 * <Button variant="ghost">Edit</Button>
 * <Button variant="danger">Delete</Button>
 * <Button href="/admin/today">Go</Button>       renders a <Link>
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-orange text-white hover:bg-orange-dark border border-transparent",
  secondary:
    "bg-surface text-ink-1 border border-hairline hover:bg-tile hover:border-outline",
  ghost: "text-ink-2 hover:text-ink-1 hover:bg-tile border border-transparent",
  danger:
    "bg-status-critical-bg text-status-critical-text border border-status-critical/30 hover:bg-status-critical/15",
};

// V3 §9: padding comes off the 4/8/12/16 spacing scale, and small controls get
// LESS padding, not more. Heights are fixed so a row of mixed buttons aligns.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 gap-1.5 text-xs",
  md: "h-9 px-4 gap-2",
  lg: "h-11 px-5 gap-2 text-sm",
};

const BASE = `inline-flex items-center justify-center rounded-control ${TYPE.button} transition-colors disabled:opacity-50 disabled:cursor-default disabled:pointer-events-none whitespace-nowrap`;

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Same shape language, rendered as a link. Keeps buttons and link-buttons
 *  from drifting apart, which is how the pill sprawl started. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  href,
  children,
  ...rest
}: Common & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link
      href={href}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
