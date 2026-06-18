import FinanceSnapshotWidget from "./FinanceSnapshotWidget";
import GoalForecastWidget from "./GoalForecastWidget";
import ScheduleWidget from "./ScheduleWidget";
import MyQueueWidget from "./MyQueueWidget";
import MovesOnlyYouWidget from "./MovesOnlyYouWidget";

// CEO cockpit (Remi). Curated to what Remi asked to see: a finance snapshot and
// a fundraising snapshot up top (where do we stand on money), then his schedule
// and his to-dos (his day), then partners to follow up (who to chase).
//
// No "fires" and no mission widget by request. A goal/fundraising KPI is noted
// for the KPI pass.

export default function CeoCockpit() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <FinanceSnapshotWidget className="lg:col-span-5" />
        <GoalForecastWidget className="lg:col-span-7" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <ScheduleWidget className="lg:col-span-6" />
        <MyQueueWidget assignee="remi" title="My to-dos" className="lg:col-span-6" />
      </div>

      <MovesOnlyYouWidget title="Partners to follow up" />
    </div>
  );
}
