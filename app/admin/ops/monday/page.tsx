import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveUserHandle } from "@/lib/admin/ops/identity";
import TaskRowWithActions, {
  type TaskRowAction,
} from "../_components/TaskRowWithActions";
import { type OpsTask } from "../_types/ops";
import {
  thisMonday,
  nextMonday,
  formatWeekHeader,
  weekDays,
  formatDayLabel,
  laDateOf,
  todayInTZ,
  dayStartInstant,
} from "@/lib/admin/ops/week";
import { getAgenda } from "@/lib/agenda/service";
import WeekPlanner, {
  type PlannerDay,
  type PlannerEvent,
} from "./WeekPlanner";
import RhythmWizard from "../_components/RhythmWizard";
import MondayOrient from "../_components/MondayOrient";
import AreaWalk from "../_components/AreaWalk";

export const dynamic = "force-dynamic";

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function MondayPlanPage() {
  const me = await resolveUserHandle();
  const currentUser = me?.handle ?? "remi";
  const orgId = me?.orgId ?? null;
  const supabase = getSupabaseAdmin();

  // This-week anchor as YYYY-MM-DD (LA), matched against the planned_week column.
  const mondayISO = thisMonday();

  // Tasks-of-mine filter: assigned to me OR unassigned.
  const mineFilter = `assigned_to.eq.${currentUser},assigned_to.is.null`;

  const [slippedRes, pinnedThisWeekRes] = await Promise.all([
    // Carryover: planned for a past week + open + mine. A leftover surfaces no
    // matter when it was last edited. (planned_week IS NULL is excluded by <.)
    supabase
      .from("ops_tasks")
      .select("*")
      .lt("planned_week", mondayISO)
      .neq("status", "done")
      .or(mineFilter)
      .order("planned_week", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: true }),
    // This week's placed work + open + mine — drives the day board.
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("planned_week", mondayISO)
      .neq("status", "done")
      .or(mineFilter)
      .order("due_date", { ascending: true, nullsFirst: true }),
  ]);

  const slippedRaw = (slippedRes.data as OpsTask[] | null) ?? [];
  const pinnedThisWeekAll = (pinnedThisWeekRes.data as OpsTask[] | null) ?? [];

  // Keep the carryover and this-week surfaces mutually exclusive so the same
  // task isn't reviewed in both places.
  const slippedIds = new Set(slippedRaw.map((t) => t.id));
  const pinnedThisWeek = pinnedThisWeekAll.filter((t) => !slippedIds.has(t.id));

  // Project names for any displayed task with a project_id, in one query.
  const referencedProjectIds = new Set<string>();
  for (const t of [...slippedRaw, ...pinnedThisWeek]) {
    if (t.project_id) referencedProjectIds.add(t.project_id);
  }
  const projectNames = new Map<string, string>();
  if (referencedProjectIds.size > 0) {
    const { data: projRows } = await supabase
      .from("ops_projects")
      .select("id, title")
      .in("id", Array.from(referencedProjectIds));
    for (const r of (projRows as { id: string; title: string }[] | null) ?? []) {
      projectNames.set(r.id, r.title);
    }
  }

  // ── Day board: this week's tasks placed on days, with the real agenda ──────
  const weekDayList = weekDays(mondayISO); // 7 ISO days, Mon → Sun
  const todayISO = todayInTZ();

  // Calendar blocks BloomOS wrote for this week's tasks: map them by event id so
  // each scheduled task shows its time, and so we don't double-render the block
  // as a context event below.
  const linkedEventIds = new Set(
    pinnedThisWeek.map((t) => t.calendar_event_id).filter((x): x is string => !!x)
  );
  const blockByEventId = new Map<string, { start: string; end: string }>();
  if (linkedEventIds.size > 0) {
    const { data: blocks } = await supabase
      .from("calendar_events")
      .select("id, start_time, end_time")
      .in("id", Array.from(linkedEventIds));
    for (const b of (blocks ?? []) as Array<{ id: string; start_time: string; end_time: string | null }>) {
      blockByEventId.set(b.id, { start: b.start_time, end: b.end_time ?? b.start_time });
    }
  }

  // Agenda for the week (read-only context). Session client + RLS; degrade to
  // an empty calendar if the read fails so the planner still works. BloomOS-owned
  // task blocks are pulled out — they render as a time chip on their task row.
  const eventsByDay = new Map<string, PlannerEvent[]>();
  try {
    const agenda = await getAgenda({
      start: new Date(dayStartInstant(mondayISO)),
      end: new Date(dayStartInstant(nextMonday())),
    });
    for (const it of agenda.items) {
      if (linkedEventIds.has(it.id)) continue; // it's a task's own block
      const dayISO = laDateOf(it.start);
      const list = eventsByDay.get(dayISO) ?? [];
      list.push({
        id: it.id,
        title: it.title,
        start: it.start,
        end: it.end,
        allDay: it.allDay,
        isExternal: it.isExternal,
        location: it.location,
      });
      eventsByDay.set(dayISO, list);
    }
  } catch (e) {
    console.error("[monday] agenda read failed:", e);
  }

  // task id → its block window, for the planner's schedule chips.
  const scheduled: Record<string, { start: string; end: string }> = {};
  for (const t of pinnedThisWeek) {
    if (t.calendar_event_id) {
      const b = blockByEventId.get(t.calendar_event_id);
      if (b) scheduled[t.id] = b;
    }
  }

  // Split this-week tasks into per-day buckets and a not-yet-scheduled tray.
  const tasksByDay = new Map<string, OpsTask[]>();
  const unscheduled: OpsTask[] = [];
  for (const t of pinnedThisWeek) {
    if (t.planned_day && weekDayList.includes(t.planned_day)) {
      const list = tasksByDay.get(t.planned_day) ?? [];
      list.push(t);
      tasksByDay.set(t.planned_day, list);
    } else {
      unscheduled.push(t);
    }
  }
  // Order within a day: day_order asc (nulls last), then due date, then created.
  const byDayOrder = (a: OpsTask, b: OpsTask) => {
    const ao = a.day_order;
    const bo = b.day_order;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    const ad = a.due_date ?? "9999-12-31";
    const bd = b.due_date ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  };
  tasksByDay.forEach((list) => list.sort(byDayOrder));

  const plannerDays: PlannerDay[] = weekDayList.map((iso) => ({
    iso,
    label: formatDayLabel(iso),
    isToday: iso === todayISO,
    events: eventsByDay.get(iso) ?? [],
    tasks: tasksByDay.get(iso) ?? [],
  }));

  // Maps don't serialize across the server/client boundary — hand over a plain object.
  const projectNamesObj: Record<string, string> = Object.fromEntries(projectNames);

  // ── Action definitions ────────────────────────────────────────────────────
  // Carryover (empty the deck before adding): plan it in (pull to this week),
  // finish it, push it forward (a deliberate roll — increments roll_count via
  // the PATCH route), or drop it off the surface entirely (archive). nowISO is
  // server-render time, fine for an archive stamp.
  const nowISO = new Date().toISOString();
  const carryoverActions: TaskRowAction[] = [
    { label: "Plan this week", variant: "primary", patch: { pinned_for_this_week: true } },
    { label: "Done", variant: "default", patch: { status: "done" } },
    { label: "Push", variant: "ghost", patch: { planned_week: nextMonday() } },
    { label: "Drop", variant: "ghost", patch: { archived_at: nowISO } },
  ];

  // ── Step content (rendered on the server, handed to the wizard shell) ───────
  const carryover = (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-1">
        Clear the carryover
      </h2>
      {slippedRaw.length === 0 ? (
        <p className="text-sm text-ink-2 mt-2 italic">
          The deck&apos;s clear — nothing carried over from an earlier week.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-1 mb-4">
            <span className="font-semibold text-ink-1">{slippedRaw.length}</span>{" "}
            {slippedRaw.length === 1 ? "item" : "items"} planned for an earlier
            week aren&apos;t done. Empty the deck before adding — plan it in,
            finish it, push it, or drop it.
          </p>
          <div className="space-y-1.5">
            {slippedRaw.map((t) => {
              const overdue = daysSince(t.updated_at);
              const rolls = t.roll_count ?? 0;
              return (
                <div key={t.id} className="space-y-1">
                  <TaskRowWithActions
                    task={t}
                    projectName={t.project_id ? projectNames.get(t.project_id) : null}
                    actions={carryoverActions}
                  />
                  <div className="text-[10px] pl-3 flex items-center gap-2">
                    {rolls > 0 && (
                      <span
                        className={
                          rolls >= 3
                            ? "text-expense font-semibold"
                            : "text-[#A56A1B]/80 font-medium"
                        }
                        title="Times pushed to a later week"
                      >
                        rolled {rolls}×
                      </span>
                    )}
                    <span className="text-[#A56A1B]/70">
                      {overdue} day{overdue === 1 ? "" : "s"} since last touched
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );

  const days = (
    <WeekPlanner
      days={plannerDays}
      unscheduled={unscheduled}
      projectNames={projectNamesObj}
      scheduled={scheduled}
    />
  );

  return (
    <RhythmWizard
      eyebrow="Monday · Aim"
      title="Plan"
      subtitle={
        <>
          <span>Week of {formatWeekHeader(mondayISO)}</span>
          <span className="text-ink-3">·</span>
          <span>as {cap(currentUser)}</span>
        </>
      }
      steps={[
        { key: "orient", label: "Orient", content: <MondayOrient /> },
        { key: "carryover", label: "Carryover", content: carryover },
        { key: "areas", label: "Areas", content: <AreaWalk orgId={orgId} handle={currentUser} /> },
        { key: "days", label: "Days", content: days },
      ]}
    />
  );
}
