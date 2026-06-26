import StatCard from "../../_components/StatCard";
import { money } from "../../finance/_components/charts";
import type { Pulse } from "@/lib/admin/briefing/pulse";

// The CEO's vital signs — four deterministic tiles above the brief. Runway and
// raised-vs-goal carry a health chip; cash and pipeline are plain magnitudes.

function runwayDelta(months: number | null): { text: string; direction: "up" | "down" | "neutral" } | undefined {
  if (months == null) return undefined;
  if (months < 3) return { text: "below floor", direction: "down" };
  if (months < 6) return { text: "watch", direction: "neutral" };
  return { text: "healthy", direction: "up" };
}

export default function PulseStrip({ pulse }: { pulse: Pulse }) {
  const runwayValue = pulse.runwayMonths == null ? "—" : `${pulse.runwayMonths.toFixed(1)} mo`;
  const goalDelta =
    pulse.pctToGoal == null
      ? undefined
      : { text: `${Math.round(pulse.pctToGoal)}% to goal`, direction: "neutral" as const };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <StatCard
        label="Runway"
        value={runwayValue}
        sub={pulse.runwayMonths == null ? "set a burn baseline" : "months beyond now"}
        delta={runwayDelta(pulse.runwayMonths)}
        muted={pulse.runwayMonths == null}
      />
      <StatCard label="Cash on hand" value={money(pulse.cashOnHand)} sub="in the bank today" />
      <StatCard
        label="Open pipeline"
        value={money(pulse.openPipelineUsd)}
        sub={`${pulse.openAskCount} open ask${pulse.openAskCount === 1 ? "" : "s"}`}
      />
      <StatCard
        label="Raised YTD"
        value={money(pulse.raisedYtd)}
        sub={pulse.goal > 0 ? `of ${money(pulse.goal)} goal` : "no goal set"}
        delta={goalDelta}
      />
    </div>
  );
}
