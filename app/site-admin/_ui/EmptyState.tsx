import type { ReactNode } from "react";
import { TYPE } from "@/lib/site/ui/typeScale";

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
 * EmptyState is for a thing that should exist and doesn't yet. It names the
 * missing thing and offers the action that creates it. An ALL-CLEAR state
 * ("Nothing needs you right now", "no overdue moves") is data, not a gap:
 * that stays a positive sentence, never this component.
 *
 * V1 props (unchanged):
 * - `label` what's empty ("Goals", "KPIs", "Reviews"); renders "No … yet".
 * - `title` optional headline override when "No {label} yet" reads wrong.
 * - `hint`  one line on how it gets filled.
 * - `action` control that creates the first one (a button or link).
 *
 * V4 props (spec §6 "EmptyState with one action for empty"; SetupEmpty.dc.html).
 * Passing any of them switches to the first-run layout:
 * - `purpose`         what this place is for, in a sentence.
 * - `primaryAction`   the one action that fills it (a primary <Button>),
 *   `primaryHint`     with an optional line under it.
 * - `secondaryAction` an alternative (a secondary <Button>), `secondaryHint`.
 * - `next`            "What happens next" after the action.
 * - `icon`            a 24px stroke icon for the round well.
 * - `footer`          a trailing link ("Back to your setup checklist").
 */
export default function EmptyState({
  label,
  title,
  hint,
  action,
  purpose,
  primaryAction,
  primaryHint,
  secondaryAction,
  secondaryHint,
  next,
  icon,
  footer,
}: {
  label: string;
  title?: string;
  hint?: ReactNode;
  action?: ReactNode;
  purpose?: ReactNode;
  primaryAction?: ReactNode;
  primaryHint?: ReactNode;
  secondaryAction?: ReactNode;
  secondaryHint?: ReactNode;
  next?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
}) {
  const isV4 = !!(purpose || primaryAction || secondaryAction || next || icon);
  const heading = title ?? `No ${label.toLowerCase()} yet`;

  if (!isV4) {
    return (
      <div className="flex flex-col items-center justify-center text-center rounded-panel border border-dashed border-hairline bg-tile px-6 py-8 gap-2">
        <p className="text-sm font-semibold text-ink-1">{heading}</p>
        {hint ? <p className="text-sm text-ink-2 max-w-sm leading-relaxed">{hint}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center px-6 sm:px-8 pt-14 pb-12">
      {icon ? (
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-app border border-hairline text-ink-2 [&>svg]:w-6 [&>svg]:h-6"
        >
          {icon}
        </span>
      ) : null}
      <h2 className={`${TYPE.sectionTitle} ${icon ? "mt-4" : ""}`}>{heading}</h2>
      {purpose ? <p className={`${TYPE.bodyMuted} mt-2 max-w-[520px]`}>{purpose}</p> : null}
      {hint ? <p className={`${TYPE.bodyMuted} mt-1 max-w-[520px]`}>{hint}</p> : null}

      {primaryAction || secondaryAction || action ? (
        <div className="flex flex-wrap justify-center gap-4 mt-6">
          {primaryAction || action ? (
            <div className="flex flex-col items-center gap-2 w-60 max-w-full">
              {primaryAction ?? action}
              {primaryHint ? <span className={`${TYPE.bodyMuted} text-[13px]`}>{primaryHint}</span> : null}
            </div>
          ) : null}
          {secondaryAction ? (
            <div className="flex flex-col items-center gap-2 w-60 max-w-full">
              {secondaryAction}
              {secondaryHint ? <span className={`${TYPE.bodyMuted} text-[13px]`}>{secondaryHint}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {next ? (
        <p className={`${TYPE.bodyMuted} text-[13px] mt-6 pt-4 border-t border-hairline max-w-[560px]`}>
          <strong className="font-semibold text-ink-1">What happens next:</strong> {next}
        </p>
      ) : null}
      {footer ? <div className="mt-4 font-semibold">{footer}</div> : null}
    </div>
  );
}
