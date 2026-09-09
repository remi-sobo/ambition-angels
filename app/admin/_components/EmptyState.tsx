import type { ReactNode } from "react";

/**
 * Labeled empty-state placeholder for the BloomOS admin (Quality Floor Q5:
 * adopted across every list surface, not just /admin/staff).
 *
 * Before this existed every "nothing here yet" was a hand-rolled muted <p>, and
 * they drifted (text-ink-2 vs ink-3, italic vs not, with/without a hint). This
 * is the one primitive: a named thing, a one-line hint on how to fill it, and an
 * optional action slot. Sits inside a section, not a full-page takeover.
 *
 * The house rule for WHEN to use it (spec-quality-floor, failure mode 6): an
 * EmptyState is for a thing that should exist and doesn't yet — it names the
 * missing thing and offers the action that creates it. An ALL-CLEAR state
 * ("Nothing needs you right now", "no overdue moves") is data, not a gap:
 * that stays a positive sentence, never this component.
 *
 * - `label` — what's empty ("Goals", "KPIs", "Reviews"); renders "No … yet".
 * - `title` — optional headline override when "No {label} yet" reads wrong.
 * - `hint`  — one line on how it gets filled.
 * - `action`— control that creates the first one (a button or link).
 */
export default function EmptyState({
  label,
  title,
  hint,
  action,
}: {
  label: string;
  title?: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-card border border-dashed border-outline bg-tile/40 px-6 py-8 gap-1.5">
      <p className="text-sm font-semibold text-ink-1">{title ?? `No ${label.toLowerCase()} yet`}</p>
      {hint ? <p className="text-xs text-ink-2 max-w-sm">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
