import type { ReactNode } from "react";
import { TYPE } from "@/lib/site/ui/typeScale";

/**
 * Notice: an inline message about the screen or panel it sits in (spec §6
 * States: "Notice for partial or stale data"; the "14 transactions need a
 * category" line in Finance.dc.html).
 *
 * Tones:
 *   info      neutral context
 *   success   something finished
 *   warning   needs attention soon
 *   danger    something failed or is blocked
 *   partial   the numbers here leave something out ("Until they have one,
 *             $3,410 of spending is left out")
 *   stale     the data is old; offer Refresh
 *
 * Status is never color alone: each tone has its own glyph, a lead sentence
 * in bold, and a role (`alert` for danger, `status` for the rest, so a stale
 * notice does not interrupt a screen reader).
 *
 * `inline` drops the box for use inside a panel, as a row with a top
 * hairline (Finance.dc.html); the default is a boxed notice.
 */
export type NoticeTone =
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "partial"
  | "stale";

const TONES: Record<
  NoticeTone,
  { box: string; well: string; glyph: ReactNode; sr: string }
> = {
  info: {
    box: "bg-tile border-hairline",
    well: "bg-app text-ink-2",
    glyph: <path d="M12 11v5M12 7.5v.5" />,
    sr: "Note",
  },
  success: {
    box: "bg-revenue-bg border-revenue/30",
    well: "bg-surface text-revenue",
    glyph: <path d="M7 12.5l3.2 3.2L17 9" />,
    sr: "Done",
  },
  warning: {
    box: "bg-status-watch-bg border-status-watch/40",
    well: "bg-surface text-status-watch-text",
    glyph: <path d="M12 7v6M12 16.5v.5" />,
    sr: "Warning",
  },
  danger: {
    box: "bg-status-critical-bg border-status-critical/40",
    well: "bg-surface text-status-critical-text",
    glyph: <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />,
    sr: "Problem",
  },
  partial: {
    box: "bg-surface border-status-watch/40",
    well: "bg-status-watch-bg text-status-watch-text",
    // A half-filled circle: some of the data, not all of it.
    glyph: <path d="M12 6a6 6 0 0 0 0 12z" fill="currentColor" />,
    sr: "Partial data",
  },
  stale: {
    box: "bg-surface border-status-watch/40",
    well: "bg-status-watch-bg text-status-watch-text",
    // A clock: the data is old.
    glyph: <path d="M12 8v4l2.5 2" />,
    sr: "Out of date",
  },
};

export default function Notice({
  tone = "info",
  title,
  children,
  action,
  inline = false,
  className = "",
}: {
  tone?: NoticeTone;
  /** The lead sentence, in bold. */
  title?: ReactNode;
  /** What it means or what to do, in secondary text. */
  children?: ReactNode;
  /** One action (a secondary <Button>, or Refresh for stale). */
  action?: ReactNode;
  inline?: boolean;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-3 ${
        inline
          ? "px-5 py-3 border-t border-hairline"
          : `px-4 py-3 rounded-panel border ${t.box}`
      } ${className}`}
    >
      <span
        aria-hidden
        className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full ${t.well}`}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {tone === "info" ||
          tone === "warning" ||
          tone === "partial" ||
          tone === "stale" ? (
            <circle cx="12" cy="12" r="7" />
          ) : null}
          {t.glyph}
        </svg>
      </span>
      <div className="flex flex-1 min-w-0 flex-wrap items-center gap-x-3 gap-y-2 min-h-[28px]">
        <p className={`flex-[1_1_280px] min-w-0 ${TYPE.body}`}>
          <span className="sr-only">{t.sr}: </span>
          {title ? <strong className="font-semibold">{title}</strong> : null}
          {title && children ? " " : null}
          {children ? <span className="text-ink-2">{children}</span> : null}
        </p>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
