import type { ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The one card primitive for BloomOS — Visual System V3 §4 and §8.
 *
 * V3's card rules, encoded once so 480 screens stop re-deriving them:
 *  - 14px radius (`rounded-panel`), never 20-24px.
 *  - Clean light surface, an extremely subtle hairline border, and NO shadow.
 *    Elevation is reserved for things that actually float (§12).
 *  - A stronger border is a SIGNAL, not decoration: `tone` promotes the border
 *    only for selected / editable / attention states.
 *
 * And the §8 card architecture — every card in the product is built from the
 * same five slots, in the same order, so Money Health, Mission Health and My
 * Day read as one system:
 *
 *   title  →  metric  →  meta  →  status  →  action
 *
 * Use <Card> for the container and <CardHeader>/<CardMetric>/<CardFooter> for
 * the slots. A card that needs a bespoke body still gets the same frame.
 */
export type CardTone = "default" | "selected" | "editable" | "attention" | "critical";

const TONES: Record<CardTone, string> = {
  // §4: "Cards should usually use a clean light surface, an extremely subtle
  // border, and little or no shadow."
  default: "border-hairline",
  // §4: "Use stronger borders only for selected objects, editable states,
  // warnings, items requiring attention."
  selected: "border-orange ring-1 ring-orange/25",
  editable: "border-outline",
  attention: "border-status-watch/50",
  critical: "border-status-critical/50",
};

export default function Card({
  children,
  tone = "default",
  padded = true,
  as: Tag = "section",
  className = "",
}: {
  children: ReactNode;
  tone?: CardTone;
  /** false when the card hosts a flush list/table that owns its own padding. */
  padded?: boolean;
  as?: "section" | "div" | "article" | "li";
  className?: string;
}) {
  return (
    <Tag
      className={`bg-surface border rounded-panel ${TONES[tone]} ${
        padded ? "p-4" : ""
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * Slot 1 — the card heading, with an optional right-aligned action. `action`
 * is where a "View all →" or an icon button goes, so it lands in the same
 * place on every card instead of wherever the page author put it.
 */
export function CardHeader({
  title,
  hint,
  action,
  className = "",
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 mb-3 ${className}`}>
      <div className="min-w-0">
        <h3 className={TYPE.cardTitle}>{title}</h3>
        {hint ? <p className={`${TYPE.metadata} mt-1`}>{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Slot 2+3 — the key number and its supporting metadata. One definition, so a
 * runway figure and an attendance figure are typeset identically.
 */
export function CardMetric({
  value,
  unit,
  meta,
  muted,
}: {
  value: ReactNode;
  /** Short qualifier rendered beside the number ("runway", "of goal"). */
  unit?: ReactNode;
  meta?: ReactNode;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className={`${TYPE.cardMetric} ${muted ? "!text-ink-3" : ""}`}>
          {value}
        </span>
        {unit ? <span className={TYPE.metadata}>{unit}</span> : null}
      </div>
      {meta ? <p className={`${TYPE.metadata} mt-2`}>{meta}</p> : null}
    </div>
  );
}

/**
 * Slots 4+5 — status on the left, optional action on the right. Keeping them
 * on one baseline is what makes a column of different cards line up.
 */
export function CardFooter({
  status,
  action,
  className = "",
}: {
  status?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  if (!status && !action) return null;
  return (
    <div
      className={`mt-3 flex items-center justify-between gap-3 min-h-[24px] ${className}`}
    >
      <div className="min-w-0">{status}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
