import OpsBoard, { type OpsWidget } from "./OpsBoard";
import MyQueueWidget from "./MyQueueWidget";
import ScheduleWidget from "./ScheduleWidget";
import SchedulingLaneWidget from "./SchedulingLaneWidget";
import FinanceSnapshotWidget from "./FinanceSnapshotWidget";
import DeadlinesFinanceWidget from "./DeadlinesFinanceWidget";
import MovesOnlyYouWidget from "./MovesOnlyYouWidget";
import AcksDueWidget from "./AcksDueWidget";

// Ops control panel (Shannon). Starting set, per Shannon's brief: her tasks,
// meetings to schedule, a financial overview, fundraising to-dos + grants,
// funders to follow up, and acknowledgments due — plus her live calendar.
// These are handed to OpsBoard, which lets her reorder and hide cards within
// her own view (persisted per-device); the CEO cockpit is unaffected. This is a
// strawman she tunes from here.

export default function OpsPanel() {
  const widgets: OpsWidget[] = [
    { key: "tasks", label: "My tasks", node: <MyQueueWidget assignee="shannon" title="My tasks" /> },
    { key: "schedule", label: "Schedule (calendar)", node: <ScheduleWidget /> },
    { key: "scheduling", label: "Meetings to schedule", node: <SchedulingLaneWidget /> },
    { key: "finance", label: "Financial overview", node: <FinanceSnapshotWidget title="Financial overview" /> },
    { key: "grants", label: "Fundraising to-dos & grants", node: <DeadlinesFinanceWidget title="Fundraising to-dos & grants" /> },
    { key: "funders", label: "Funders to follow up", node: <MovesOnlyYouWidget title="Funders to follow up" /> },
    { key: "acks", label: "Acknowledgments due", node: <AcksDueWidget /> },
  ];

  return <OpsBoard widgets={widgets} />;
}
