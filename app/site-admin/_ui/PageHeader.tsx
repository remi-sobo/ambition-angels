import Link from "next/link";
import type { ReactNode } from "react";
import { TYPE } from "@/lib/site/ui/typeScale";
import MoreActionsMenu, { type MenuAction } from "@/app/site-admin/_ui/ui/MoreActionsMenu";

/**
 * Canonical page header for the BloomOS admin.
 *
 * Every page renders its title through this component so the type, spacing
 * and action placement stay identical across the product.
 *
 * V1 props (88 call sites, unchanged):
 * - `title`    the page name (Visual System V3 §2: 28px/600).
 * - `subtitle` one-line description; accepts JSX (links etc.).
 * - `eyebrow`  optional small uppercase label above the title.
 * - `actions`  optional right-aligned controls. Wraps below the title on
 *              narrow screens.
 *
 * V4 props (spec §5 page anatomy; Main.dc.html for lists, Donor.dc.html for
 * detail). Use these on migrated pages instead of `actions`:
 * - `breadcrumb`       ancestors, e.g. [{ label: "Donors & Funders", href }].
 *                      A string title is appended as the current page.
 * - `chips`            identity chips under the title (type, owner, since).
 *                      Use <IdentityChip> for the house look.
 * - `primaryAction`    THE one action for the page (a primary <Button>).
 *                      It renders last, at the far right.
 * - `secondaryActions` at most one or two neutral buttons, before the menu.
 * - `moreActions`      everything else, in the "More actions" overflow menu.
 *                      Pass MenuAction[] (href items from a server page;
 *                      onSelect items need a client parent) or a node.
 */
export type Crumb = { label: string; href?: string };

export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  breadcrumb,
  chips,
  primaryAction,
  secondaryActions,
  moreActions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: Crumb[];
  chips?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  moreActions?: MenuAction[] | ReactNode;
}) {
  const isV4 = !!(breadcrumb || chips || primaryAction || secondaryActions || moreActions);
  const more =
    Array.isArray(moreActions) && moreActions.length > 0 ? (
      <MoreActionsMenu items={moreActions as MenuAction[]} />
    ) : Array.isArray(moreActions) ? null : (
      moreActions
    );
  const hasActions = !!(actions || primaryAction || secondaryActions || more);

  return (
    <div className={isV4 ? "mb-5" : "mb-8"}>
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav aria-label="Breadcrumb" className={`${TYPE.bodyMuted} text-[13px] mb-2`}>
          <ol className="flex flex-wrap items-center">
            {breadcrumb.map((c) => (
              <li key={c.label} className="inline-flex items-center">
                {c.href ? (
                  <Link href={c.href} className="text-ink-2 underline underline-offset-2 hover:text-ink-1">
                    {c.label}
                  </Link>
                ) : (
                  <span>{c.label}</span>
                )}
                <span aria-hidden className="px-2">
                  /
                </span>
              </li>
            ))}
            {typeof title === "string" ? (
              <li aria-current="page" className="text-ink-1">
                {title}
              </li>
            ) : null}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {/* V3 §2: no 10px type, and letter spacing comes way down (0.25em →
              0.04em). The eyebrow is ink-2 rather than tinted accent: it is
              context, not a call to action. */}
          {eyebrow ? (
            <div className="text-xs font-medium uppercase tracking-[0.04em] text-ink-2 mb-1.5">{eyebrow}</div>
          ) : null}
          <h1 className={TYPE.pageTitle}>{title}</h1>
          {subtitle ? <p className={`${TYPE.bodyMuted} mt-1.5 max-w-reading`}>{subtitle}</p> : null}
          {chips ? <div className="flex flex-wrap items-center gap-2 mt-2">{chips}</div> : null}
        </div>
        {hasActions ? (
          // V1 keeps its no-shrink action group; V4 lets the group wrap on a
          // phone so a secondary action plus the primary never overflow 390px.
          <div className="flex flex-wrap items-center gap-2 max-w-full">
            {actions}
            {secondaryActions}
            {more}
            {primaryAction}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * An identity chip for the header (Donor.dc.html: "Person", "Major donor",
 * "Owner: Remi"). Neutral on purpose: identity is not a status. Pass
 * `initials` for the owner chip's avatar dot.
 */
export function IdentityChip({ children, initials }: { children: ReactNode; initials?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-7 ${initials ? "pl-0.5 pr-2.5" : "px-2.5"} rounded-full border border-hairline bg-surface text-[13px] text-ink-1`}
    >
      {initials ? (
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full bg-accent-soft text-orange-dark text-xs font-bold"
        >
          {initials}
        </span>
      ) : null}
      {children}
    </span>
  );
}
