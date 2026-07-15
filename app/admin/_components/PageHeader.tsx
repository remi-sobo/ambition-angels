import type { ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Canonical module page header for the BloomOS admin.
 *
 * Every top-level module landing page (Board, Students, Finance, Ops, …)
 * renders its title through this component so the typographic treatment,
 * spacing, and the right-aligned action slot stay identical across the
 * product. Before this existed each page hand-rolled its own header, which
 * drifted (font-display vs font-heading, different sizes, an unstyled stub).
 *
 * - `title`    — the page name (font-heading, bold, 2xl, cream).
 * - `subtitle` — one-line description; accepts JSX (links etc.).
 * - `eyebrow`  — optional small uppercase label above the title (e.g. the
 *                finance dashboard's "Fiscal year 2026").
 * - `actions`  — optional right-aligned controls (a button, a form, or a
 *                group). Wraps below the title on narrow screens.
 */
export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        {eyebrow ? (
          <div className="text-[10px] uppercase tracking-[0.25em] text-orange/80 mb-1">
            {eyebrow}
          </div>
        ) : null}
        <h1 className={TYPE.pageTitle}>{title}</h1>
        {subtitle ? (
          <p className={`${TYPE.bodyMuted} mt-0.5`}>{subtitle}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
