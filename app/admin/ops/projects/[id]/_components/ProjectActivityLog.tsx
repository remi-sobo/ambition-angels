import Timeline, { type TimelineEntry } from "@/app/admin/_components/ui/Timeline";
import type { OpsProject, OpsTask } from "../../../_types/ops";

/**
 * Derived activity feed for a project, on the kit Timeline (V4 Stage G:
 * Detail archetype, "one timeline on the left").
 *
 * No separate activity table in v1 (per PR Ops-1 spec). Events come from the
 * existing task + project rows: creation and completion timestamps, and the
 * project's own status when it has moved past 'active'. Newest first.
 */

type ActivityEvent = { id: string; ts: string; kind: "project" | "task"; message: string };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function projectActivity(project: OpsProject, tasks: OpsTask[]): ActivityEvent[] {
  const events: ActivityEvent[] = [
    { id: `p-created`, ts: project.created_at, kind: "project", message: `${cap(project.created_by)} created this project.` },
  ];
  if (project.status !== "active") {
    events.push({ id: "p-status", ts: project.updated_at, kind: "project", message: `Status set to ${project.status}.` });
  }
  if (project.completed_at) events.push({ id: "p-done", ts: project.completed_at, kind: "project", message: "Project marked done." });
  for (const t of tasks) {
    events.push({ id: `t-${t.id}-c`, ts: t.created_at, kind: "task", message: `${cap(t.created_by)} added task "${t.title}".` });
    if (t.completed_at) events.push({ id: `t-${t.id}-d`, ts: t.completed_at, kind: "task", message: `Task "${t.title}" completed.` });
  }
  return events.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}

const DOT = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
  </svg>
);
const CHECK = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M6 12.5l4 4L18 8" />
  </svg>
);

export default function ProjectActivityLog({ project, tasks }: { project: OpsProject; tasks: OpsTask[] }) {
  const entries: TimelineEntry[] = projectActivity(project, tasks).map((e) => ({
    id: e.id,
    kind: e.kind,
    icon: /completed|done/.test(e.message) ? CHECK : DOT,
    title: e.message,
    meta: time(e.ts),
    date: shortDate(e.ts),
    dateTime: e.ts,
  }));
  return (
    <Timeline
      title="Activity"
      entries={entries}
      filters={[
        { key: "all", label: "All" },
        { key: "task", label: "Tasks" },
        { key: "project", label: "Project" },
      ]}
      emptyText="No activity yet."
    />
  );
}
