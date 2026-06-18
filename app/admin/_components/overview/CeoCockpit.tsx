import RunwayCard from "./RunwayCard";
import FiresWidget from "./FiresWidget";
import GoalForecastWidget from "./GoalForecastWidget";
import MovesOnlyYouWidget from "./MovesOnlyYouWidget";
import MissionProofWidget from "./MissionProofWidget";
import FinancialHealthWidget from "./FinancialHealthWidget";

// CEO cockpit (Remi). Answers, in order: are we surviving (runway), what's on
// fire, is the money coming (goal+forecast), what must I personally do (moves
// only you), is the mission working (mission proof), plus the finance detail.
//
// Runway is the hero, computed cash/burn at the locked 3/1.5 thresholds. The
// forecast is committed + weighted-open vs goal — never total pipeline (the raw
// pipeline lives on the Fundraising page). Mission leads with FO lift and a
// dated manual figure, never a fabricated number.

export default function CeoCockpit() {
  return (
    <div className="space-y-6">
      <RunwayCard />

      <FiresWidget />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <GoalForecastWidget className="lg:col-span-5" />
        <MovesOnlyYouWidget className="lg:col-span-7" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <MissionProofWidget className="lg:col-span-5" />
        <FinancialHealthWidget className="lg:col-span-7" />
      </div>
    </div>
  );
}
