import OpsBoard, { type OpsWidget } from "./OpsBoard";
import MyQueueWidget from "./MyQueueWidget";
import TodayAgenda from "./TodayAgenda";
import SchedulingLaneWidget from "./SchedulingLaneWidget";
import FinanceSnapshotWidget from "./FinanceSnapshotWidget";
import DeadlinesFinanceWidget from "./DeadlinesFinanceWidget";
import MovesOnlyYouWidget from "./MovesOnlyYouWidget";

// Ops control panel (Shannon). Starting set, per Shannon's brief: her tasks,
// meetings to schedule, a financial overview, fundraising to-dos + grants,
// and funders to follow up — plus her live calendar. Acknowledgments live in
// the tasks queue (Operations), not as a dashboard widget, per Shannon.
// These are handed to OpsBoard, which lets her reorder and hide cards within
// her own view (persisted per-device); the CEO cockpit is unaffected. This is a
// strawman she tunes from here.

export default function OpsPanel() {
  const widgets: OpsWidget[] = [
    { key: "tasks", label: "My tasks", node: <MyQueueWidget assignee="shannon" title="My tasks" /> },
    { key: "schedule", label: "Agenda (two-lane)", node: <TodayAgenda mode="lanes" /> },
    { key: "scheduling", label: "Meetings to schedule", node: <SchedulingLaneWidget /> },
    { key: "finance", label: "Financial overview", node: <FinanceSnapshotWidget title="Financial overview" /> },
    { key: "grants", label: "Fundraising to-dos & grants", node: <DeadlinesFinanceWidget title="Fundraising to-dos & grants" /> },
    { key: "funders", label: "Funders to follow up", node: <MovesOnlyYouWidget title="Funders to follow up" /> },
  ];

  return <OpsBoard widgets={widgets} />;
}
