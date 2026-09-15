import type { ReactNode } from "react";
import { Sparkline } from "../finance/_components/charts";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The universal stat card — Visual System V3 §8.
 *
 * "Money Health, Mission Health, My Day and similar cards should share one
 * consistent card architecture. Standardize: card heading, key number,
 * supporting metadata, status, optional action."
 *
 * So this is the same five-slot skeleton as <Card>, specialised for a single
 * headline number:
 *
 *   label (12px, sentence case) → value (28px/600, tabular)
 *   → delta badge + supporting metadata → optional sparkline
 *
 * V3 changes from the old stat card: the label is no longer a 11px uppercase
 * letter-spaced micro-label (§2), the radius drops from 28px to 14px (§4), the
 * heavy 1.5px outline becomes a hairline and the shadow is gone (§4, §12) —
 * a stat card is a quiet surface, not an object demanding attention.
 *
 * Pure function of props; server-renderable.
 */

export type Delta = { text: string; direction: "up" | "down" | "neutral" };

export default function StatCard({
  label,
  value,
  sub,
  delta,
  spark,
  muted,
  action,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  delta?: Delta;
  spark?: number[];
  muted?: boolean;
  /** Slot 5 — an optional "View all →" style control. */
  action?: ReactNode;
}) {
  const deltaTone =
    delta?.direction === "up"
      ? "text-revenue bg-revenue-bg"
      : delta?.direction === "down"
        ? "text-expense bg-expense-bg"
        : "text-ink-2 bg-tile";
  return (
    <div className="bg-surface border border-hairline rounded-panel p-4 min-w-0">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`${TYPE.cardLabel} truncate`}>{label}</div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={`${TYPE.cardMetric} ${muted ? "!text-ink-3" : ""}`}>{value}</div>
      <div className="mt-2 flex items-center gap-2 min-h-[20px]">
        {delta && (
          <span
            className={`${TYPE.badge} px-2 py-0.5 rounded-full ${deltaTone}`}
          >
            {/* §13: direction is carried by the arrow glyph, not by hue alone. */}
            {delta.direction === "up" ? "↑ " : delta.direction === "down" ? "↓ " : ""}
            {delta.text}
          </span>
        )}
        {sub && <span className={`${TYPE.metadata} truncate`}>{sub}</span>}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline values={spark} width={150} height={28} />
        </div>
      )}
    </div>
  );
}
