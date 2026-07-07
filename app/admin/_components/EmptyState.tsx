import type { ReactNode } from "react";

/**
 * Labeled empty-state placeholder for the BloomOS admin.
 *
 * Before this existed every "nothing here yet" was a hand-rolled muted <p>, and
 * they drifted (text-ink-2 vs ink-3, italic vs not, with/without a hint). This
 * is the one primitive: a named thing, a one-line hint on how to fill it, and an
 * optional action slot. Sits inside a section, not a full-page takeover.
 *
 * - `label` — what's empty ("Goals", "KPIs", "Reviews").
 * - `hint`  — one line on how it gets filled.
 * - `action`— optional control (a button/link to add the first one).
 */
export default function EmptyState({
  label,
  hint,
  action,
}: {
  label: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-card border border-dashed border-outline bg-tile/40 px-6 py-8 gap-1.5">
      <p className="text-sm font-semibold text-ink-1">No {label.toLowerCase()} yet</p>
      {hint ? <p className="text-xs text-ink-2 max-w-sm">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
