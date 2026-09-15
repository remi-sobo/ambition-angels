import type { ReactNode } from "react";
import { STATUS_CHIP, type Status } from "@/lib/admin/status";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Badges for BloomOS — Visual System V3 §4.
 *
 * This is one of the few places V3 KEEPS `border-radius: 999px`: "pills should
 * be reserved primarily for statuses, filters, badges, tags and counts."
 * Everything else in the product (buttons, tabs, nav rows, inputs) lost the
 * capsule. That is what makes a pill mean something again.
 *
 * Type is the §2 badge role (12px/600) — the old 10-11px badges were below the
 * readable floor.
 */

const BASE = `inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 align-middle ${TYPE.badge}`;

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-tile text-ink-2 border border-hairline",
  accent: "bg-orange-light text-orange-dark",
  success: "bg-revenue-bg text-revenue",
  warning: "bg-status-watch-bg text-status-watch-text",
  danger: "bg-status-critical-bg text-status-critical-text",
};

export default function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={`${BASE} ${TONES[tone]} ${className}`}>{children}</span>;
}

/**
 * The status badge: pale tint + AA-contrast label + a saturated dot.
 *
 * §13 — "do not communicate status through color alone." The dot is a shape
 * cue, the label is always a word, and each tone's text color clears 4.5:1 on
 * both the workspace and its own tint (see tailwind.config.ts).
 */
export function StatusBadge({
  status,
  children,
  dot = true,
  className = "",
}: {
  status: Status;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  const s = STATUS_CHIP[status];
  return (
    <span className={`${BASE} ${s.bg} ${s.text ?? "text-ink-1"} ${className}`}>
      {dot && (
        <span aria-hidden className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** A count pill — the other sanctioned use of the 999px radius. */
export function CountBadge({
  value,
  tone = "neutral",
  className = "",
}: {
  value: number;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full tabular-nums ${TYPE.badge} ${TONES[tone]} ${className}`}
    >
      {value}
    </span>
  );
}
