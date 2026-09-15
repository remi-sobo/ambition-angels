import type { ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The page frame for BloomOS — Visual System V3 §8 and §9.
 *
 * Two problems this fixes at once:
 *
 * 1. Width (§8). Screens were capped around 1100px, which left a wide dead
 *    gutter on any modern desktop while the content columns stayed cramped.
 *    The default is now `workspace` (1280px). Long-form, single-column screens
 *    pass `width="reading"` so line length stays comfortable — the point is a
 *    deliberate choice per screen, not one arbitrary cap everywhere.
 *
 * 2. Rhythm (§9). Horizontal gutter and vertical padding came off a dozen
 *    different values. Here they come off the 4/8/12/16/24/32/48/64 scale,
 *    once: 16px gutter on mobile, 32px from `lg`, 24px/32px top and bottom.
 *
 * `<PageSection>` is the vertical rhythm between major blocks — "use more
 * whitespace between major page sections" — so pages stop hand-tuning margins.
 */

const WIDTHS = {
  workspace: "max-w-workspace",
  reading: "max-w-reading",
  full: "",
} as const;

export default function PageShell({
  children,
  width = "workspace",
  className = "",
}: {
  children: ReactNode;
  width?: keyof typeof WIDTHS;
  className?: string;
}) {
  return (
    <div className={`px-4 lg:px-8 py-6 lg:py-8 ${WIDTHS[width]} ${className}`}>
      {children}
    </div>
  );
}

/** A major block within a page. 32px of air above it, 48px on large screens. */
export function PageSection({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-8 lg:mt-12 first:mt-0 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title ? <h2 className={TYPE.sectionTitle}>{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
