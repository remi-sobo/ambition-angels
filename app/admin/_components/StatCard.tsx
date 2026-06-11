import type { ReactNode } from "react";
import { Sparkline } from "../finance/_components/charts";

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
      ? "text-green-400 bg-green-500/10 border-green-500/20"
      : delta?.direction === "down"
      ? "text-red-400 bg-red-500/10 border-red-500/20"
      : "text-gray-mid bg-white/5 border-white/10";
  return (
    <div className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-5 min-w-0">
      <div className="text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-white/35 mb-2 truncate">
        {label}
      </div>
      <div
        className={`font-heading font-semibold text-[28px] leading-none tracking-tight [font-variant-numeric:tabular-nums] ${
          muted ? "text-white/30" : "text-cream"
        }`}
      >
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
        {sub && <span className="text-xs text-gray-mid truncate">{sub}</span>}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline values={spark} width={150} height={28} />
        </div>
      )}
    </div>
  );
}
