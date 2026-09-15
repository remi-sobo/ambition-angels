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
 * - `title`    — the page name (Visual System V3 §2: 28px/600).
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
    <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
      <div className="min-w-0">
        {/* V3 §2: no 10px type, and letter spacing comes way down (0.25em →
            0.04em). The eyebrow is ink-2 rather than tinted accent — it is
            context, not a call to action. */}
        {eyebrow ? (
          <div className="text-xs font-medium uppercase tracking-[0.04em] text-ink-2 mb-1.5">
            {eyebrow}
          </div>
        ) : null}
        <h1 className={TYPE.pageTitle}>{title}</h1>
        {subtitle ? (
          <p className={`${TYPE.bodyMuted} mt-1.5 max-w-reading`}>{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
