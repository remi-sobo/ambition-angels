import type { ReactNode } from "react";

/**
 * In-body section heading for the BloomOS admin — the small uppercase label
 * that sits above a group of rows / cards within a page (e.g. "Members",
 * "Meetings", "Cash flow").
 *
 * This is the counterpart to PageHeader: PageHeader is the one h1 per page;
 * SectionHeading is every subordinate label inside it. Both exist so the
 * typographic system is defined in one place instead of being re-typed (and
 * drifting — Finance used to render these larger and in orange).
 *
 * - `as`        — "h2" (default) or "h3" for nesting depth.
 * - `className` — spacing/extra utilities (e.g. "mb-2"); appended to the
 *                 canonical type styles.
 */
export default function SectionHeading({
  children,
  className,
  as: Tag = "h2",
}: {
  children: ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <Tag
      className={`text-[11px] font-semibold uppercase tracking-wider text-cream/70${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </Tag>
  );
}
