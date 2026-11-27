import Link from "next/link";
import type { ReactNode } from "react";
import { TYPE } from "@/lib/site/ui/typeScale";
import { figureView, type FigureValue, type Freshness } from "@/lib/site/ui/figure";

/**
 * Figure: one number, with where it came from and how fresh it is (spec §2
 * principle 3, §6; the "Stripe standard" in specs/v4-prototypes/AUTHORING.md).
 *
 *   label        "Given this year"
 *   value        "$186,400"   (or "No data yet" when missing, NEVER 0)
 *   compare      "vs $12,000 last year"            optional
 *   source       "From these 42 donors, as of now"  REQUIRED
 *
 * The provenance idea is <Metric>'s (Contract 2: a number never appears
 * without a definition behind it). Figure makes the source line a required
 * prop, so a number cannot reach a screen without saying where it came from.
 * For a catalog metric use <MetricFigure>, which feeds the catalog's state
 * in. The state logic lives in lib/admin/figure.ts and is unit-tested.
 *
 * Layouts: `strip` is a cell inside <SummaryStrip> (24px value); `card` is a
 * standalone panel (the 28px card metric, what <StatCard> renders).
 */
export type FigureProps = {
  label: string;
  value: FigureValue;
  /** Where the number comes from and how fresh it is. Required on purpose. */
  source: string;
  compare?: ReactNode;
  /** `danger` for late or overdue comparisons ("Oldest is 12 days late"). */
  compareTone?: "muted" | "default" | "danger";
  freshness?: Freshness;
  /** Where the number drills into. */
  href?: string;
  /** Stale state: where "Refresh" goes (server pages) ... */
  refreshHref?: string;
  /** ... or what it does (client parents). */
  onRefresh?: () => void;
  layout?: "strip" | "card";
  /** Slot under the source line (a sparkline, a second figure). */
  extra?: ReactNode;
  /** Card layout: a control at the top right ("View all"). */
  action?: ReactNode;
  /** Card layout: dim the value (an inert or placeholder figure). */
  muted?: boolean;
};

export default function Figure(props: FigureProps) {
  return <FigureBody {...props} />;
}

/**
 * The renderer, with `source` optional so <StatCard> can keep its deprecated
 * no-source callers working. Not exported from the barrel: new code uses
 * <Figure>, which requires the source.
 */
export function FigureBody({
  label,
  value,
  source,
  compare,
  compareTone = "muted",
  freshness = "fresh",
  href,
  refreshHref,
  onRefresh,
  layout = "strip",
  extra,
  action,
  muted = false,
  valueNode,
}: Omit<FigureProps, "source"> & {
  source?: string;
  /** StatCard legacy: a pre-formatted node shown as the value (treated as present). */
  valueNode?: ReactNode;
}) {
  const view = figureView({
    value: valueNode !== undefined ? "present" : value,
    freshness,
    canRefresh: !!(refreshHref || onRefresh),
  });
  const card = layout === "card";

  const valueClass = card
    ? `${TYPE.cardMetric} ${muted ? "!text-ink-3" : ""}`
    : "font-heading font-semibold text-2xl leading-tight tracking-[-0.02em] tabular-nums text-ink-1";

  const renderedValue =
    view.valueText === null ? (
      // Missing: a sentence where the number would be, in secondary ink and
      // a step smaller, so it can never be read as a figure.
      <span className="font-heading font-semibold text-xl leading-8 text-ink-2">{view.missingText}</span>
    ) : href ? (
      <Link href={href} className={`${valueClass} hover:underline underline-offset-4 decoration-1`}>
        {valueNode ?? view.valueText}
      </Link>
    ) : (
      <span className={valueClass}>{valueNode ?? view.valueText}</span>
    );

  const refresh = view.showRefresh ? (
    refreshHref ? (
      <Link href={refreshHref} className="font-semibold underline underline-offset-2">
        Refresh
      </Link>
    ) : (
      <button type="button" onClick={onRefresh} className="font-semibold underline underline-offset-2">
        Refresh
      </button>
    )
  ) : null;

  const compareClass =
    compareTone === "danger"
      ? "text-status-critical-text font-semibold"
      : compareTone === "default"
        ? "text-ink-1"
        : "text-ink-2";

  return (
    <div
      className={
        card
          ? "flex flex-col bg-surface border border-hairline rounded-panel p-4 min-w-0"
          : "flex flex-col px-5 py-4 min-w-0"
      }
      data-figure-state={view.state}
    >
      <div className="flex items-start justify-between gap-2 min-h-[20px]">
        <span className={card ? `${TYPE.cardLabel} truncate` : `${TYPE.bodyMuted} text-[13px]`}>{label}</span>
        {view.badge ? (
          <span className={`${TYPE.badge} shrink-0 rounded-full px-2 py-px bg-status-watch-bg text-status-watch-text`}>
            {view.badge}
          </span>
        ) : action ? (
          <span className="shrink-0">{action}</span>
        ) : null}
      </div>
      <div className={`flex flex-wrap items-baseline gap-x-2 ${card ? "mt-2" : "mt-0.5"}`}>
        {renderedValue}
        {compare && view.valueText !== null && !card ? (
          <span className={`text-[13px] ${compareClass}`}>{compare}</span>
        ) : null}
      </div>
      {compare && view.valueText !== null && card ? (
        <div className={`mt-2 text-xs ${compareClass} min-h-[20px] flex items-center gap-2`}>{compare}</div>
      ) : null}
      {source ? (
        <p
          className={`text-xs mt-1 ${
            view.sourceTone === "warning" ? "text-status-watch-text" : "text-ink-2"
          } ${card ? "truncate" : ""}`}
        >
          {source}
          {refresh ? <> {refresh}</> : null}
        </p>
      ) : null}
      {extra ? <div className="mt-3">{extra}</div> : null}
    </div>
  );
}

/**
 * A row of figures in one panel (spec §5 "Summary strip"; Main.dc.html,
 * Donor.dc.html). Cells wrap at 200px and are divided by hairlines.
 */
export function SummaryStrip({
  label,
  children,
  minCell = 200,
}: {
  /** Accessible name for the region, e.g. "Summary for this view". */
  label: string;
  children: ReactNode;
  minCell?: 200 | 220;
}) {
  return (
    <section
      aria-label={label}
      className={`grid ${
        minCell === 220 ? "grid-cols-[repeat(auto-fit,minmax(220px,1fr))]" : "grid-cols-[repeat(auto-fit,minmax(200px,1fr))]"
      } bg-surface border border-hairline rounded-panel mb-4 overflow-hidden [&>*]:border-hairline [&>*]:border-b [&>*:last-child]:border-b-0 sm:[&>*]:border-b-0 sm:[&>*]:border-r sm:[&>*:last-child]:border-r-0`}
    >
      {children}
    </section>
  );
}
