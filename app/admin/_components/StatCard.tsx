import type { ReactNode } from "react";
import { Sparkline } from "../finance/_components/charts";
import { TYPE } from "@/lib/admin/typeScale";

// The universal stat card (docs/bloomos/06-design-system.md §4.1):
// label (11px uppercase) → value (28-32px semibold, tabular-nums) →
// delta chip → optional sparkline. Pure function of props; server-renderable.

export type Delta = { text: string; direction: "up" | "down" | "neutral" };

export default function StatCard({
  label,
  value,
  sub,
  delta,
  spark,
  muted,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  delta?: Delta;
  spark?: number[];
  muted?: boolean;
}) {
  const deltaColor =
    delta?.direction === "up"
      ? "text-revenue bg-revenue-bg border-revenue/30"
      : delta?.direction === "down"
      ? "text-expense bg-expense-bg border-expense/30"
      : "text-ink-2 bg-tile border-outline";
  return (
    <div className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-5 min-w-0">
      <div className={`${TYPE.cardLabel} mb-2 truncate`}>
        {label}
      </div>
      <div className={`${TYPE.cardMetric} ${muted ? "!text-ink-3" : ""}`}>
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2 min-h-[20px]">
        {delta && (
          <span
            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full border ${deltaColor}`}
          >
            {delta.direction === "up" ? "↑ " : delta.direction === "down" ? "↓ " : ""}
            {delta.text}
          </span>
        )}
        {sub && <span className="text-xs text-ink-2 truncate">{sub}</span>}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline values={spark} width={150} height={28} />
        </div>
      )}
    </div>
  );
}
