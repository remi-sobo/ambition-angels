import OpsBoard, { type OpsWidget } from "./OpsBoard";
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
// The widgets are rendered here (server-side, one data source each) and handed
// to OpsBoard, which lets Shannon reorder and hide cards within her own view —
// persisted per-device. The CEO cockpit doesn't use the board, so it's
// unaffected. These six are a strawman until Shannon marks them up.

export default function OpsPanel() {
  const widgets: OpsWidget[] = [
    { key: "queue", label: "My queue", node: <MyQueueWidget /> },
    { key: "acks", label: "Acknowledgments due", node: <AcksDueWidget /> },
    { key: "scheduling", label: "Scheduling lane", node: <SchedulingLaneWidget /> },
    { key: "hygiene", label: "Data hygiene", node: <DataHygieneWidget /> },
    { key: "deadlines", label: "Deadlines & finance ops", node: <DeadlinesFinanceWidget /> },
    { key: "followthrough", label: "Fundraising follow-through", node: <FollowThroughWidget /> },
  ];

  return <OpsBoard widgets={widgets} />;
}
