import Link from "next/link";
import type { ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The list row for BloomOS — Visual System V3 §4 and §8.
 *
 * Lists are what the product mostly IS: obligations, tasks, gifts, meetings,
 * documents. V3 §8 sets the priority order for a row and this component is
 * where it lives:
 *
 *   1. title            — the thing itself, always the loudest element
 *   2. status / due     — a compact badge, never a shouting line of red
 *   3. context          — the why-line, quiet and secondary
 *
 * The overdue rule from §8 is the reason this exists: "For overdue tasks,
 * don't make the entire line visually red. Use red as a signal, not as
 * dominant typography." So `meta` carries the red badge and the title stays
 * ink-1. A row never repaints itself by status.
 *
 * <ListRows> supplies the hairline dividers so callers stop re-deriving them.
 */

export function ListRows({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <ul className={`divide-y divide-hairline ${className}`}>{children}</ul>;
}

export default function ListRow({
  title,
  href,
  meta,
  context,
  leading,
  actions,
  className = "",
}: {
  title: ReactNode;
  /** When set the title becomes the row's link target. */
  href?: string;
  /** Badges: status, due date, owner. Sits beside the title. */
  meta?: ReactNode;
  /** The quiet explanatory line under the title. */
  context?: ReactNode;
  /** Checkbox, avatar, or drag handle. */
  leading?: ReactNode;
  /** Right-aligned row controls. */
  actions?: ReactNode;
  className?: string;
}) {
  const titleClass = `${TYPE.body} font-semibold truncate`;
  return (
    <li className={`flex items-start gap-3 py-3 ${className}`}>
      {leading ? <div className="shrink-0 pt-0.5">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {href ? (
            <Link href={href} className={`${titleClass} hover:text-orange`}>
              {title}
            </Link>
          ) : (
            <span className={titleClass}>{title}</span>
          )}
          {meta}
        </div>
        {context ? <p className={`${TYPE.metadata} mt-1`}>{context}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </li>
  );
}
