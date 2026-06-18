import MyQueueWidget from "./MyQueueWidget";
import AcksDueWidget from "./AcksDueWidget";
import SchedulingLaneWidget from "./SchedulingLaneWidget";
import DataHygieneWidget from "./DataHygieneWidget";
import DeadlinesFinanceWidget from "./DeadlinesFinanceWidget";
import FollowThroughWidget from "./FollowThroughWidget";

// Ops control panel (Shannon). Answers: what's on my plate (my queue), who needs
// a thank-you (acks due), what needs scheduling (scheduling lane), is the data
// clean (data hygiene — where the stale-data alert lives, actionable), what's
// due (deadlines + finance ops), and what to chase (follow-through).
//
// These six are a strawman until Shannon marks them up; Phase 4 lets her
// reorder and hide cards within her own view.

export default function OpsPanel() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <MyQueueWidget className="lg:col-span-6" />
        <AcksDueWidget className="lg:col-span-6" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <SchedulingLaneWidget className="lg:col-span-6" />
        <DataHygieneWidget className="lg:col-span-6" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <DeadlinesFinanceWidget className="lg:col-span-6" />
        <FollowThroughWidget className="lg:col-span-6" />
      </div>
    </div>
  );
}
