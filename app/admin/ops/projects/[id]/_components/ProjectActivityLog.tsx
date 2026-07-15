import type { OpsProject, OpsTask } from "../../../_types/ops";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Derived activity feed for a project.
 *
 * No separate activity table in v1 (per PR Ops-1 spec). We compute events
 * from the existing task + project rows: creation timestamps, completion
 * timestamps, and the project's own status when it has moved past
 * 'active'. Events get grouped by calendar day, newest day first.
 */

type ActivityEvent = {
  ts: string; // ISO
  message: string;
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function fmtDayLabel(day: string): string {
  const d = new Date(day + "T00:00:00");
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (day === todayKey) return "Today";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year:
      d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ProjectActivityLog({
  project,
  tasks,
}: {
  project: OpsProject;
  tasks: OpsTask[];
}) {
  const events: ActivityEvent[] = [];

  events.push({
    ts: project.created_at,
    message: `${cap(project.created_by)} created this project.`,
  });

  if (project.status !== "active") {
    events.push({
      ts: project.updated_at,
      message: `Project status set to '${project.status}'.`,
    });
  }
  if (project.completed_at) {
    events.push({
      ts: project.completed_at,
      message: "Project marked done.",
    });
  }

  for (const t of tasks) {
    events.push({
      ts: t.created_at,
      message: `${cap(t.created_by)} added task "${t.title}".`,
    });
    if (t.completed_at) {
      events.push({
        ts: t.completed_at,
        message: `Task "${t.title}" completed.`,
      });
    }
  }

  events.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

  if (events.length === 0) {
    return (
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <h2 className={`${TYPE.sectionHeader} mb-3`}>
          Activity
        </h2>
        <p className="text-sm text-ink-2 italic">No activity yet.</p>
      </section>
    );
  }

  // Group by day.
  const groups = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const k = dayKey(e.ts);
    const arr = groups.get(k) ?? [];
    arr.push(e);
    groups.set(k, arr);
  }
  const days = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : -1));

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <h2 className={`${TYPE.sectionHeader} mb-4`}>
        Activity
      </h2>
      <div className="space-y-5">
        {days.map((day) => (
          <div key={day}>
            <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-2">
              {fmtDayLabel(day)}
            </div>
            <ol className="space-y-1.5">
              {groups.get(day)!.map((e, i) => (
                <li
                  key={`${day}-${i}`}
                  className="flex items-baseline gap-3 text-sm"
                >
                  <span className="shrink-0 text-[11px] text-ink-3 font-mono w-14">
                    {fmtTime(e.ts)}
                  </span>
                  <span className="text-ink-1">{e.message}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
