import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getAgenda } from "@/lib/agenda/service";
import {
  thisMonday,
  nextMonday,
  weekDays,
  laDateOf,
  todayInTZ,
  dayStartInstant,
} from "@/lib/admin/ops/week";

/**
 * "This week" pulse for the rail — a deterministic per-day load (calendar events
 * + planned tasks) for the current LA week, so the rail shows the shape of the
 * week at a glance and links into Monday Plan. Session client throughout; RLS
 * spans all the viewer's orgs, so the task read filters to the active org
 * explicitly.
 */

export type PulseDay = {
  key: string; // YYYY-MM-DD
  dow: string; // single-letter weekday
  isToday: boolean;
  isPast: boolean;
  events: number;
  tasks: number;
  load: number;
};

export type WeekPulse = {
  days: PulseDay[];
  totalEvents: number;
  totalTasks: number;
};

export async function getWeekPulse(): Promise<WeekPulse> {
  const monday = thisMonday();
  const keys = weekDays(monday);
  const todayKey = todayInTZ();

  // Events per day (read-only context; degrade to empty on failure).
  const eventsByDay = new Map<string, number>();
  try {
    const agenda = await getAgenda({
      start: new Date(dayStartInstant(monday)),
      end: new Date(dayStartInstant(nextMonday())),
    });
    for (const it of agenda.items) {
      const k = laDateOf(it.start);
      eventsByDay.set(k, (eventsByDay.get(k) ?? 0) + 1);
    }
  } catch {
    /* no calendar → no event load */
  }

  // Planned (not-done) tasks placed on a day this week.
  const tasksByDay = new Map<string, number>();
  let totalTasks = 0;
  try {
    const ctx = await getOrgContext();
    if (ctx) {
      const sb = createServerSupabase();
      const { data } = await sb
        .from("ops_tasks")
        .select("planned_day")
        .eq("org_id", ctx.orgId)
        .eq("planned_week", monday)
        .neq("status", "done");
      for (const r of (data ?? []) as Array<{ planned_day: string | null }>) {
        totalTasks += 1;
        if (r.planned_day) tasksByDay.set(r.planned_day, (tasksByDay.get(r.planned_day) ?? 0) + 1);
      }
    }
  } catch {
    /* no tasks read → zero */
  }

  let totalEvents = 0;
  const days: PulseDay[] = keys.map((key) => {
    const events = eventsByDay.get(key) ?? 0;
    const tasks = tasksByDay.get(key) ?? 0;
    totalEvents += events;
    return {
      key,
      dow: new Date(key + "T00:00:00").toLocaleDateString("en-US", { weekday: "narrow" }),
      isToday: key === todayKey,
      isPast: key < todayKey,
      events,
      tasks,
      load: events + tasks,
    };
  });

  return { days, totalEvents, totalTasks };
}
