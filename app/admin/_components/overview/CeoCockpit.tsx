import RunwayCard from "./RunwayCard";
import FinancialHealthWidget from "./FinancialHealthWidget";
import PipelineWidget from "./PipelineWidget";
import PrioritiesWidget from "./PrioritiesWidget";

// CEO cockpit (Remi). Answers: are we surviving, is the money coming, what must
// I personally do, is the mission working, what's on fire.
//
// Phase 1 — first arrangement from widgets that already have data: runway leads,
// then finance + pipeline, then deadlines. Phase 2 adds the curated cockpit
// widgets (goal+forecast, moves-only-you, fires, mission proof) and demotes the
// raw pipeline.

export default function CeoCockpit() {
  return (
    <div className="space-y-6">
      <RunwayCard />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <FinancialHealthWidget className="lg:col-span-7" />
        <PipelineWidget className="lg:col-span-5" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <PrioritiesWidget className="lg:col-span-4" />
      </div>
    </div>
  );
}
