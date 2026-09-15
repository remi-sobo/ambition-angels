import type { ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Inline alert for BloomOS — Visual System V3 §4, §13.
 *
 * One component for "something needs saying about this screen": a failed save,
 * a stale data warning, a success confirmation. Before this each surface
 * hand-rolled a tinted div, which is how six different reds appeared.
 *
 * §13, status is never color alone — every tone ships a glyph and the tone is
 * named in the accessible role (`alert` for danger/warning, `status` for the
 * quieter ones), so a screen reader and a greyscale display both get it.
 */

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONES: Record<AlertTone, { box: string; icon: string; glyph: ReactNode }> = {
  info: {
    box: "bg-tile border-hairline",
    icon: "text-ink-2",
    glyph: <path d="M8 7.5v4M8 4.6v.9" />,
  },
  success: {
    box: "bg-revenue-bg border-revenue/30",
    icon: "text-revenue",
    glyph: <path d="M4.5 8.3l2.4 2.4 4.6-5" />,
  },
  warning: {
    box: "bg-status-watch-bg border-status-watch/40",
    icon: "text-status-watch-text",
    glyph: <path d="M8 5.6v3.2M8 11.2v.6" />,
  },
  danger: {
    box: "bg-status-critical-bg border-status-critical/40",
    icon: "text-status-critical-text",
    glyph: <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />,
  },
};

export default function Alert({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  const urgent = tone === "danger" || tone === "warning";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-panel border px-4 py-3 ${t.box} ${className}`}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className={`w-4 h-4 shrink-0 mt-0.5 ${t.icon}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {tone !== "success" && <circle cx="8" cy="8" r="6.2" />}
        {t.glyph}
      </svg>
      <div className="min-w-0 flex-1">
        {title ? (
          <p className="text-sm font-semibold text-ink-1">{title}</p>
        ) : null}
        {children ? (
          <div className={`${TYPE.bodyMuted} ${title ? "mt-0.5" : ""}`}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
