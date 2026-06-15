import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The one button primitive for the BloomOS admin (spec Phase 3). Standardizes
 * the four button shapes that were copy-pasted across pages so they stop
 * drifting. Terracotta stays meaningful: only `primary` uses the accent fill.
 *
 * <Button>Save</Button>                      primary (terracotta)
 * <Button variant="secondary">Cancel</Button> tile + outline
 * <Button variant="ghost">Edit</Button>       text-only
 * <Button variant="danger">Delete</Button>    critical
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-orange text-white hover:bg-orange-dark",
  secondary:
    "bg-tile text-ink-1 border-[1.5px] border-outline hover:bg-[#EFE6D4]",
  ghost: "text-ink-2 hover:text-ink-1 hover:bg-tile",
  danger:
    "bg-status-critical-bg text-status-critical-text border-[1.5px] border-status-critical/40 hover:bg-status-critical/15",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "text-[11px] px-3 py-1",
  md: "text-xs px-4 py-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:cursor-default ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
