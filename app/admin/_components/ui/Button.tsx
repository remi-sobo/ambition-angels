import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The one button primitive for BloomOS: Visual System V3 §4, extended for V4
 * (specs/bloomos-v4-product-readiness.md §6, prototypes in specs/v4-prototypes).
 *
 * Buttons carry the 9px `control` radius; the 999px pill is reserved for
 * statuses, filters, badges and counts. Ranks, so a screen can say which
 * action is THE action:
 *
 *   primary    terracotta fill, white label    ONE per screen (V4 accent discipline)
 *   secondary  neutral surface + strong border  the common case
 *   quiet      text only                        tertiary / inline ("ghost" is the old name)
 *   danger     destructive, tinted not shouty
 *   strong     dark ink fill                    the lead action inside a panel when the
 *                                               page's primary already exists (the next-step
 *                                               bar's "Mark done", Donor.dc.html)
 *
 * Sizes: `md` is the 36px desktop toolbar target, `lg` the 44px touch / page
 * header target (AUTHORING.md). `sm` (32px) stays for dense rows and old callers.
 *
 * Every variant clears WCAG AA: `orange` resolves to `--accent-ink` (#9D532C),
 * 5.66:1 under white. The vivid `--accent` never sits behind a label.
 *
 *   <Button>Save</Button>
 *   <Button variant="secondary">Cancel</Button>
 *   <Button loading>Saving</Button>                 spinner, aria-busy, disabled
 *   <Button iconOnly aria-label="More actions">…</Button>   aria-label is required
 *   <Button href="/admin/today">Go</Button>         renders a Next <Link>
 */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "ghost" | "danger" | "strong";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-orange text-white hover:bg-orange-dark border border-transparent",
  secondary: "bg-surface text-ink-1 border border-outline hover:bg-tile",
  quiet: "bg-transparent text-ink-2 hover:text-ink-1 hover:bg-tile border border-transparent",
  ghost: "bg-transparent text-ink-2 hover:text-ink-1 hover:bg-tile border border-transparent",
  danger:
    "bg-status-critical-bg text-status-critical-text border border-status-critical/30 hover:bg-status-critical/15",
  strong: "bg-ink-1 text-surface border border-transparent hover:bg-ink-1/90",
};

// V3 §9: padding comes off the 4/8/12/16 scale. Heights are fixed so a row of
// mixed buttons aligns.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 gap-1.5 text-xs",
  md: "h-9 px-4 gap-2",
  lg: "h-11 px-5 gap-2 text-sm",
};

// Icon-only buttons are square at the same height.
const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

const BASE = `inline-flex items-center justify-center shrink-0 rounded-control ${TYPE.button} transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none whitespace-nowrap`;

/** The class string a button of this rank and size wears. Exported so a
 *  primitive that must render its own element (a menu trigger, a file input
 *  label) can match the shape without hand-rolling it. */
export function buttonClass({
  variant = "primary",
  size = "md",
  iconOnly = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  className?: string;
} = {}): string {
  return `${BASE} ${VARIANTS[variant]} ${iconOnly ? ICON_SIZES[size] : SIZES[size]} ${className}`.trim();
}

function Spinner() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="w-4 h-4 motion-safe:animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M8 2a6 6 0 1 1-6 6" />
    </svg>
  );
}

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Shows a spinner, sets aria-busy and disables the control. Keep the label:
   *  "Saving" reads better than a bare spinner. */
  loading?: boolean;
  children: ReactNode;
};

/** Icon-only buttons have no visible text, so the accessible name is required. */
type IconOnly = { iconOnly: true; "aria-label": string };
type WithText = { iconOnly?: false };

type AsButton = Common &
  (IconOnly | WithText) & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;
type AsLink = Common &
  (IconOnly | WithText) & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children">;

export type ButtonProps = AsButton | AsLink;

export default function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", className = "", loading = false, iconOnly = false, children } = props;
  const cls = buttonClass({ variant, size, iconOnly, className });
  const content = (
    <>
      {loading ? <Spinner /> : null}
      {loading && iconOnly ? null : children}
    </>
  );

  if (typeof props.href === "string") {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { variant: _v, size: _s, className: _c, loading: _l, iconOnly: _i, children: _ch, href, ...rest } = props;
    return (
      <Link
        href={href}
        className={cls}
        aria-busy={loading || undefined}
        aria-disabled={loading || undefined}
        {...rest}
      >
        {content}
      </Link>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variant: _v, size: _s, className: _c, loading: _l, iconOnly: _i, children: _ch, href: _h, type, disabled, ...rest } =
    props as AsButton;
  return (
    <button
      type={type ?? "button"}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
}

/** Same shape language, rendered as a link. Kept for existing callers;
 *  new code can pass `href` to <Button>. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  href,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
} & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={buttonClass({ variant, size, className })} {...rest}>
      {children}
    </Link>
  );
}
