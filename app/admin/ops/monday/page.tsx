import Link from "next/link";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import TaskRowWithActions, {
  type TaskRowAction,
} from "../_components/TaskRowWithActions";
import {
  categoryBadgeClass,
  categoryLabel,
  formatRelative,
  type AdminUserId,
  type OpsProject,
  type OpsTask,
} from "../_types/ops";
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

export const dynamic = "force-dynamic";

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function readCurrentUser(): AdminUserId | null {
  const c = cookies().get("admin_user")?.value;
  return c === "remi" || c === "shannon" ? c : null;
}

function otherUser(u: AdminUserId | null): AdminUserId | null {
  if (u === "remi") return "shannon";
  if (u === "shannon") return "remi";
  return null;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function MondayPlanPage() {
  const currentUser = readCurrentUser() ?? "remi";
  const otherPerson = otherUser(currentUser);
  const supabase = getSupabaseAdmin();

  // This-week anchor as YYYY-MM-DD (LA), matched against the planned_week column.
  const mondayISO = thisMonday();

  // Tasks-of-mine filter: assigned to me OR unassigned.
  const mineFilter = `assigned_to.eq.${currentUser},assigned_to.is.null`;
  // Tasks-of-other-person filter: explicitly assigned to them.

  const [
    slippedRes,
    pinnedThisWeekRes,
    candidatesRes,
    neglectedProjectsRes,
    otherPersonPinnedRes,
  ] = await Promise.all([
    // Section 1: planned for a past week + open + mine. Replaces the old
    // pinned + updated_at-window heuristic: a leftover surfaces no matter when
    // it was last edited. (planned_week IS NULL is excluded by the < compare.)
    supabase
      .from("ops_tasks")
      .select("*")
      .lt("planned_week", mondayISO)
      .neq("status", "done")
      .or(mineFilter)
      .order("planned_week", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: true }),
    // Section 2: planned for this week + open + assigned to me (or null)
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("planned_week", mondayISO)
      .neq("status", "done")
      .or(mineFilter)
      .order("due_date", { ascending: true, nullsFirst: true }),
    // Section 3a: unplanned + open + assigned to me (or null). Sort by
    // due_date asc nulls last, then last_touched (updated_at) asc.
    supabase
      .from("ops_tasks")
      .select("*")
      .is("planned_week", null)
      .neq("status", "done")
      .or(mineFilter)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: true })
      .limit(26), // 25 + 1 to detect "more"
    // Section 3b: active projects assigned to me (or null), most neglected
    supabase
      .from("ops_projects")
      .select("*")
      .eq("status", "active")
      .or(mineFilter)
      .order("last_touched_at", { ascending: true })
      .limit(10),
    // Section 3c: other person's pinned tasks (read-only)
    otherPerson
      ? supabase
          .from("ops_tasks")
          .select("*")
          .eq("pinned_for_this_week", true)
          .eq("assigned_to", otherPerson)
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("category", { ascending: true })
          .limit(15)
      : Promise.resolve({ data: [], error: null } as { data: OpsTask[]; error: null }),
  ]);

  const slippedRaw = (slippedRes.data as OpsTask[] | null) ?? [];
  const pinnedThisWeekAll = (pinnedThisWeekRes.data as OpsTask[] | null) ?? [];
  const candidatesAll = (candidatesRes.data as OpsTask[] | null) ?? [];
  const neglectedProjects = (neglectedProjectsRes.data as OpsProject[] | null) ?? [];
  const otherPersonPinned =
    (otherPersonPinnedRes.data as OpsTask[] | null) ?? [];

  // Section 2 deviates slightly from spec: exclude tasks already in Section 1
  // (last-week-slipped). Keeps the surfaces mutually exclusive so the user
  // isn't reviewing the same task in both places. See diff summary.
  const slippedIds = new Set(slippedRaw.map((t) => t.id));
  const pinnedThisWeek = pinnedThisWeekAll.filter(
    (t) => !slippedIds.has(t.id)
  );

  const candidates = candidatesAll.slice(0, 25);
  const hasMoreCandidates = candidatesAll.length > 25;

  // Look up project names for any task that has a project_id, in a single
  // query — avoids the N+1 trap.
  const referencedProjectIds = new Set<string>();
  for (const t of [...slippedRaw, ...pinnedThisWeek, ...candidates, ...otherPersonPinned]) {
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
  for (const p of neglectedProjects) projectNames.set(p.id, p.title);

  // Open-task counts for neglected projects.
  const openCounts = new Map<string, number>();
  if (neglectedProjects.length > 0) {
    const ids = neglectedProjects.map((p) => p.id);
    const { data: taskRows } = await supabase
      .from("ops_tasks")
      .select("project_id, status")
      .in("project_id", ids)
      .neq("status", "done");
    for (const r of (taskRows as Array<{ project_id: string }> | null) ?? []) {
      openCounts.set(r.project_id, (openCounts.get(r.project_id) ?? 0) + 1);
    }
  }

  // ── Day board: this week's tasks placed on days, with the real agenda ──────
  const weekDayList = weekDays(mondayISO); // 7 ISO days, Mon → Sun
  const todayISO = todayInTZ();

  // Agenda for the week (read-only context). Session client + RLS; degrade to
  // an empty calendar if the read fails so the planner still works.
  const eventsByDay = new Map<string, PlannerEvent[]>();
  try {
    const agenda = await getAgenda({
      start: new Date(dayStartInstant(mondayISO)),
      end: new Date(dayStartInstant(nextMonday())),
    });
    for (const it of agenda.items) {
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

  // ── Action definitions reused inline ──────────────────────────────────────
  const slippedActions: TaskRowAction[] = [
    { label: "Carry to this week", variant: "primary", patch: { pinned_for_this_week: true } },
    { label: "Mark done", variant: "default", patch: { status: "done" } },
    { label: "Drop", variant: "ghost", patch: { pinned_for_this_week: false } },
  ];
  const candidateActions: TaskRowAction[] = [
    { label: "Pin for this week", variant: "primary", patch: { pinned_for_this_week: true } },
  ];

  return (
    <div className="max-w-6xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <header>
        <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none">
          Monday Plan
        </h1>
        <div className="mt-2 flex items-baseline gap-3 flex-wrap text-sm">
          <span className="text-ink-2">Week of {formatWeekHeader(mondayISO)}</span>
          <span className="text-ink-3">·</span>
          <span className="text-ink-2">Planning as {cap(currentUser)}</span>
        </div>
        <Link href="/admin/ops" className="mt-2 inline-block text-xs text-ink-2 hover:text-ink-1">
          ← Ops
        </Link>
      </header>

      {/* ── Section 1: Slipped from last week ──────────────────────────── */}
      {slippedRaw.length > 0 && (
        <section className="rounded-card border border-[#D9BE86] bg-amber-500/[0.04] p-6">
          <h2 className="text-xs uppercase tracking-wider text-[#A56A1B] mb-1">
            From last week
          </h2>
          <p className="text-sm text-ink-1 mb-4">
            <span className="font-semibold text-ink-1">{slippedRaw.length}</span>{" "}
            {slippedRaw.length === 1 ? "item" : "items"} planned for an earlier
            week aren&apos;t done. Carry over, mark done, or drop:
          </p>
          <div className="space-y-1.5">
            {slippedRaw.map((t) => {
              const overdue = daysSince(t.updated_at);
              return (
                <div key={t.id} className="space-y-1">
                  <TaskRowWithActions
                    task={t}
                    projectName={t.project_id ? projectNames.get(t.project_id) : null}
                    actions={slippedActions}
                  />
                  <div className="text-[10px] text-[#A56A1B]/70 pl-3">
                    {overdue} day{overdue === 1 ? "" : "s"} since last touched
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 2: This week, by day ───────────────────────────────── */}
      <WeekPlanner
        days={plannerDays}
        unscheduled={unscheduled}
        projectNames={projectNamesObj}
      />

      {/* ── Section 3: Candidates ──────────────────────────────────────── */}
      <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
        <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-4">
          Candidates for this week
        </h2>

        {/* 3a: Open tasks not pinned */}
        <details open className="group mb-4">
          <summary className="cursor-pointer select-none flex items-baseline gap-2 mb-2">
            <span className="text-sm font-medium text-ink-1 group-open:text-orange transition-colors">
              Open tasks ({candidatesAll.length})
            </span>
            <span className="text-[11px] text-ink-2">
              {candidates.length === 0
                ? "nothing unpinned"
                : "sorted by due date, then most-neglected first"}
            </span>
          </summary>
          {candidates.length === 0 ? (
            <p className="text-sm text-ink-2 mt-2 pl-2 italic">
              No unpinned open tasks. You&apos;re already on top of it.
            </p>
          ) : (
            <div className="space-y-1.5 mt-2">
              {candidates.map((t) => (
                <TaskRowWithActions
                  key={t.id}
                  task={t}
                  projectName={t.project_id ? projectNames.get(t.project_id) : null}
                  actions={candidateActions}
                />
              ))}
              {hasMoreCandidates && (
                <p className="text-xs text-ink-2 pl-2 pt-1">
                  {candidatesAll.length - 25} more open tasks not shown.
                </p>
              )}
            </div>
          )}
        </details>

        {/* 3b: Neglected active projects */}
        <details className="group mb-4">
          <summary className="cursor-pointer select-none flex items-baseline gap-2 mb-2">
            <span className="text-sm font-medium text-ink-1 group-open:text-orange transition-colors">
              Active projects ({neglectedProjects.length})
            </span>
            <span className="text-[11px] text-ink-2">
              sorted by neglect — least recently touched first
            </span>
          </summary>
          {neglectedProjects.length === 0 ? (
            <p className="text-sm text-ink-2 mt-2 pl-2 italic">
              No active projects assigned to you (or unassigned).
            </p>
          ) : (
            <div className="space-y-1.5 mt-2">
              {neglectedProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/ops/projects/${p.id}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border-[1.5px] border-outline bg-surface shadow-panel hover:bg-[#EFE6D4] transition-colors group/row"
                >
                  <span className="text-sm text-ink-1 group-hover/row:text-orange flex-1 truncate">
                    {p.title}
                  </span>
                  <span
                    className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${categoryBadgeClass(p.category)}`}
                  >
                    {categoryLabel(p.category)}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-2 font-mono">
                    {openCounts.get(p.id) ?? 0} open
                  </span>
                  <span className="shrink-0 text-[11px] text-[#A56A1B]/70 font-mono">
                    {formatRelative(p.last_touched_at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </details>

        {/* 3c: Other person's pinned tasks (read-only) */}
        <details className="group">
          <summary className="cursor-pointer select-none flex items-baseline gap-2 mb-2">
            <span className="text-sm font-medium text-ink-1 group-open:text-orange transition-colors">
              {otherPerson ? `${cap(otherPerson)}'s pinned tasks` : "Counterpart"}{" "}
              ({otherPersonPinned.length})
            </span>
            <span className="text-[11px] text-ink-2">read-only</span>
          </summary>
          {otherPersonPinned.length === 0 ? (
            <p className="text-sm text-ink-2 mt-2 pl-2 italic">
              {otherPerson ? cap(otherPerson) : "They"} hasn&apos;t pinned anything for this week yet.
            </p>
          ) : (
            <div className="space-y-1.5 mt-2">
              {otherPersonPinned.map((t) => (
                <TaskRowWithActions
                  key={t.id}
                  task={t}
                  projectName={t.project_id ? projectNames.get(t.project_id) : null}
                  readOnly
                />
              ))}
            </div>
          )}
        </details>
      </section>
    </div>
  );
}
