import type { ReactNode } from "react";
import { Sparkline } from "../finance/_components/charts";
import { TYPE } from "@/lib/admin/typeScale";
import { FigureBody } from "./ui/Figure";
import type { Freshness } from "@/lib/admin/figure";

/**
 * The stat card: a thin wrapper around <Figure> in its `card` layout (spec
 * §6: "StatCard becomes a wrapper around it").
 *
 *   label → value (28px/600, tabular) → delta badge + compare → source line
 *   → optional sparkline
 *
 * New callers pass `source` (where the number comes from and how fresh it
 * is) and, when it applies, `freshness`. A value of null/undefined renders
 * "No data yet", never a zero. The old `sub` line and the no-source form
 * still render for the existing callers, and are deprecated.
 *
 * Pure function of props; server-renderable.
 */

export type Delta = { text: string; direction: "up" | "down" | "neutral" };

type Base = {
  label: string;
  value: ReactNode;
  delta?: Delta;
  spark?: number[];
  muted?: boolean;
  /** Slot 5: an optional "View all" style control. */
  action?: ReactNode;
  href?: string;
  freshness?: Freshness;
  refreshHref?: string;
};

type WithSource = Base & {
  /** Where the number comes from and how fresh it is ("From recorded gifts, Jan 1 to now"). */
  source: string;
  /** A comparison line ("vs $12,000 last year"). */
  compare?: ReactNode;
  /** @deprecated Use `compare` for comparisons and `source` for provenance. */
  sub?: string;
};

type LegacyNoSource = Base & {
  /** @deprecated Every figure needs a source line (spec §2). Pass `source`. */
  source?: undefined;
  compare?: ReactNode;
  /** @deprecated Use `compare` for comparisons and `source` for provenance. */
  sub?: string;
};

export type StatCardProps = WithSource | LegacyNoSource;

export default function StatCard({
  label,
  value,
  sub,
  delta,
  spark,
  muted,
  action,
  href,
  source,
  compare,
  freshness,
  refreshHref,
}: StatCardProps) {
  const deltaTone =
    delta?.direction === "up"
      ? "text-revenue bg-revenue-bg"
      : delta?.direction === "down"
        ? "text-expense bg-expense-bg"
        : "text-ink-2 bg-tile";

  const deltaBadge = delta ? (
    <span className={`${TYPE.badge} px-2 py-0.5 rounded-full ${deltaTone}`}>
      {/* §13: direction is carried by the arrow glyph, not by hue alone. */}
      {delta.direction === "up" ? "↑ " : delta.direction === "down" ? "↓ " : ""}
      {delta.text}
    </span>
  ) : null;

  const compareLine =
    deltaBadge || compare || sub ? (
      <>
        {deltaBadge}
        {compare ? <span className="truncate">{compare}</span> : null}
        {sub ? <span className={`${TYPE.metadata} truncate`}>{sub}</span> : null}
      </>
    ) : undefined;

  // Legacy callers pass formatted ReactNode values ("$1,200", <span>…</span>).
  // A string or number goes through the Figure state logic (so null is
  // "No data yet"); any other node is shown as given.
  const isPlain = value === null || value === undefined || typeof value === "string" || typeof value === "number";

  return (
    <FigureBody
      layout="card"
      label={label}
      value={isPlain ? (value as string | number | null | undefined) : undefined}
      source={source}
      compare={compareLine}
      compareTone="default"
      freshness={freshness}
      refreshHref={refreshHref}
      href={href}
      action={action}
      muted={muted}
      valueNode={isPlain ? undefined : value}
      extra={spark && spark.length > 1 ? <Sparkline values={spark} width={150} height={28} /> : undefined}
    />
  );
}
