import type { ReactNode } from "react";
import Link from "next/link";
import { StatusChip } from "../../../_components/StatusChip";
import type { Status } from "@/lib/admin/status";
import type { NarrativeKpi } from "@/lib/admin/strategy/narrative";

/**
 * Shared presentation primitives for the Strategy Narrative movements.
 * Kept in one place so the three movements format money and status the same
 * way (the surface is one continuous story; presenter mode paginates it later).
 */

// Status → the word a funder reads. One mapping, mirrors the five-value scale.
export const STATUS_LABEL: Record<Status, string> = {
  critical: "Behind",
  watch: "At risk",
  due: "Due",
  healthy: "On track",
  neutral: "Not started",
};

// Initiative (strategy) status → status scale, for the small leading dot.
export const INITIATIVE_STATUS: Record<string, Status> = {
  done: "healthy",
  in_progress: "due",
  todo: "neutral",
  blocked: "critical",
};

export const DOT_BG: Record<Status, string> = {
  healthy: "bg-status-healthy",
  due: "bg-status-due",
  watch: "bg-status-watch",
  critical: "bg-status-critical",
  neutral: "bg-ink-3",
};

/** Compact USD for headline numbers: $1.12M · $516K · $198K · $0. */
export function formatUsd(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000).toLocaleString("en-US")}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Format a KPI value for its unit. Targets and actuals both flow through here. */
export function formatValue(unit: string | null, value: number | null): string {
  if (value == null) return "—";
  switch (unit) {
    case "usd":
      return formatUsd(value);
    case "percent":
      return `${value % 1 === 0 ? value : value.toFixed(1)}%`;
    case "months":
      return `${value % 1 === 0 ? value : value.toFixed(1)} mo`;
    case "boolean":
      return value >= 1 ? "Yes" : "No";
    default:
      return value.toLocaleString("en-US");
  }
}

/** A measure (KPI) line: title, current / target, status chip. */
export function MeasureRow({ kpi }: { kpi: NarrativeKpi }) {
  const hasTarget = kpi.target != null;
  // Show where it started when a baseline is set: from X → now / target. Tells
  // a momentum story instead of a bare number against a goal.
  const hasBaseline = kpi.baseline != null && kpi.baseline !== kpi.current;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-hairline last:border-0">
      <span className="text-sm text-ink-1">{kpi.title}</span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-heading font-semibold tabular-nums text-ink-1">
          {hasBaseline && <span className="text-ink-3 font-normal">{formatValue(kpi.unit, kpi.baseline)} → </span>}
          {formatValue(kpi.unit, kpi.current)}
          {hasTarget && <span className="text-ink-3 font-normal"> / {formatValue(kpi.unit, kpi.target)}</span>}
        </span>
        <StatusChip status={kpi.status}>{STATUS_LABEL[kpi.status]}</StatusChip>
      </span>
    </div>
  );
}

/**
 * A big headline stat: label, value, optional sublabel + status chip. With
 * `href`, the whole card is a link to the canonical detail page (the widget
 * stays purely navigational — no detail is duplicated on the narrative).
 */
export function StatBig({
  label,
  value,
  sub,
  status,
  accent = false,
  href,
  hrefLabel,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  status?: Status;
  accent?: boolean;
  href?: string;
  hrefLabel?: string;
}) {
  const cardCls = `rounded-card-lg border p-5 ${accent ? "border-orange/30 bg-orange-light" : "border-hairline bg-surface"}`;
  const inner = (
    <>
      <div className="text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3 mb-1.5">
        {label}
      </div>
      <div className="font-display text-3xl sm:text-4xl leading-none tabular-nums text-ink-1">{value}</div>
      {(sub || status) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {status && <StatusChip status={status}>{STATUS_LABEL[status]}</StatusChip>}
          {sub && <span className="text-[12px] text-ink-2">{sub}</span>}
        </div>
      )}
      {href && (
        <div className="mt-2 text-[11px] font-medium text-ink-3 group-hover:text-orange transition-colors">
          {hrefLabel ?? "View details"} →
        </div>
      )}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={`group block ${cardCls} transition-colors hover:border-orange/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={cardCls}>{inner}</div>;
}

/** Section wrapper giving each movement a consistent eyebrow + display title. */
export function MovementHeader({ n, title, lead }: { n: number; title: string; lead?: ReactNode }) {
  return (
    <header className="mb-8">
      <div className="text-[10px] uppercase tracking-[0.25em] text-orange/80 mb-2">
        Strategy Narrative · Movement {n} of 3
      </div>
      <h1 className="font-display text-5xl sm:text-6xl text-ink-1 leading-[0.95] mb-4">{title}</h1>
      {lead && <div className="max-w-[680px] text-lg text-ink-1 leading-relaxed">{lead}</div>}
    </header>
  );
}
