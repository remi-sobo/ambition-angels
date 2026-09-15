import type { ReactNode } from "react";
import { STATUS_CHIP, categoryDot, scoreToStatus, type Status } from "@/lib/admin/status";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The one pill primitive for the BloomOS admin (spec Phase 3). Every status
 * pill renders through this so a color always maps to one of the five status
 * values. Visual: pale tint + ink-1 label (AAA on cream) + a saturated dot.
 *
 * - <StatusChip status="critical">Overdue</StatusChip>
 * - <CategoryTag category="fundraising">Fundraising</CategoryTag>  (neutral + dot)
 * - <ScoreBadge score={82} />                                       (tiered)
 */

// Visual System V3 §4: the 999px radius survives here because a status IS one
// of the sanctioned pills. The label moved to the §2 badge role (12px/600 —
// the old 11px sat under the readable floor) and now takes each status's
// AA-verified `text` step instead of a flat ink-1.
const BASE = `inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 align-middle ${TYPE.badge}`;

export function StatusChip({
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
    <span className={`${BASE} ${s.bg} ${s.text} ${className}`}>
      {dot && <span aria-hidden className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Taxonomy tag — categories are not status, so the chip is neutral and the
 * category hue survives only as a small dot (keeps "color = status").
 */
export function CategoryTag({
  category,
  children,
  className = "",
}: {
  category: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`${BASE} bg-status-neutral-bg text-ink-2 ${className}`}>
      <span
        aria-hidden
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: categoryDot(category) }}
      />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Prospect score as a tiered badge (replaces the raw orange number). */
export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-ink-2">—</span>;
  return (
    <StatusChip status={scoreToStatus(score)} className="font-mono tabular-nums">
      {score}
    </StatusChip>
  );
}
