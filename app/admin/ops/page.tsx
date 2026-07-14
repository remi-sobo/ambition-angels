import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin/auth";
import {
  TASK_CATEGORIES,
  readTaskHealth,
  todayISO,
  type TaskCategory,
  type OpsProject,
  type OpsTask,
} from "./_types/ops";
import TasksSurface from "./_components/TasksSurface";
import StuckWorkRollup from "./_components/StuckWorkRollup";
import TodayView from "./_components/TodayView";
import ThisWeekView from "./_components/ThisWeekView";
import ActiveProjectsList from "./_components/ActiveProjectsList";
import CategoryCounts from "./_components/CategoryCounts";
import PageHeader from "../_components/PageHeader";

// Force dynamic — this page is task-state-dependent; we don't want a
// stale ISR cache to lie about "what's due today."
export const dynamic = "force-dynamic";

export default async function OpsLandingPage({
  searchParams,
}: {
  searchParams?: { assignee?: string | string[] };
}) {
  const supabase = getSupabaseAdmin();
  const today = todayISO();
  const currentUser = await getAdminUser();

  // Mirror the assignee filter that TasksSurface keeps in the URL (?assignee=),
  // so a person-filtered view scopes the whole landing — Today and This Week —
  // not just the main list. Changing the dropdown re-renders this (force-dynamic)
  // page with the new param.
  const rawAssignee = Array.isArray(searchParams?.assignee)
    ? searchParams?.assignee[0]
    : searchParams?.assignee;
  const assignee =
    rawAssignee === "remi" || rawAssignee === "shannon" || rawAssignee === "unassigned"
      ? rawAssignee
      : "all";
  const matchesAssignee = (t: OpsTask) =>
    assignee === "all"
      ? true
      : assignee === "unassigned"
        ? !t.assigned_to
        : t.assigned_to === assignee;

  // All ops queries fan out in parallel.
  const [allTasksRes, activeProjectsRes] = await Promise.all([
    supabase
      .from("ops_tasks")
      .select("*")
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(1000),
    // "Active Projects" = ops_projects rows whose lifecycle status is 'active'
    // (not 'paused'/'done'/'archived'), 10 most recently touched. Status is set
    // by hand on the project page, with one automation: every grant gets a
    // workspace project at creation, and when the grant reaches a terminal
    // stage (declined/closed) that project is auto-marked 'done' so finished
    // grants don't linger here (lib/fundraising/grants.ts syncGrantProjectStatus).
    supabase
      .from("ops_projects")
      .select("*")
      .eq("status", "active")
      .order("last_touched_at", { ascending: false })
      .limit(10),
  ]);

  const allTasks = (allTasksRes.data as OpsTask[] | null) ?? [];
  const activeProjects = (activeProjectsRes.data as OpsProject[] | null) ?? [];

  // Pin/due-derived slices for the preserved Today / This Week sections.
  // Archived tasks never appear on these active surfaces.
  const dueToday = allTasks.filter(
    (t) => t.due_date === today && t.status !== "done" && !t.archived_at && matchesAssignee(t)
  );
  const dueTodayIds = new Set(dueToday.map((t) => t.id));
  const pinnedToday = allTasks.filter(
    (t) =>
      t.pinned_for_today &&
      t.status !== "done" &&
      !t.archived_at &&
      !dueTodayIds.has(t.id) &&
      t.due_date !== today &&
      matchesAssignee(t)
  );
  const pinnedWeek = allTasks
    .filter((t) => t.pinned_for_this_week && t.status !== "done" && !t.archived_at && matchesAssignee(t))
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

  // Project name lookup for task rows / pills. Cover every project a task
  // references (active or not) plus the active project list.
  const referencedProjectIds = new Set<string>();
  for (const t of allTasks) if (t.project_id) referencedProjectIds.add(t.project_id);
  for (const p of activeProjects) referencedProjectIds.add(p.id);

  const projectNames: Record<string, string> = {};
  for (const p of activeProjects) projectNames[p.id] = p.title;
  const missing = Array.from(referencedProjectIds).filter((id) => !projectNames[id]);
  if (missing.length > 0) {
    const { data: projRows } = await supabase
      .from("ops_projects")
      .select("id, title")
      .in("id", missing);
    for (const r of (projRows as { id: string; title: string }[] | null) ?? []) {
      projectNames[r.id] = r.title;
    }
  }

  // Project name Map for the legacy section components (they expect a Map).
  const projectNamesMap = new Map(Object.entries(projectNames));

  // Chronically deferred work — same readTaskHealth() read the row badges use,
  // so the rollup and the badges can never disagree. (specs/ops-stuck-work.md)
  const stuckTasks = allTasks
    .filter((t) => readTaskHealth(t).health === "stuck")
    .sort((a, b) => readTaskHealth(b).ageDays - readTaskHealth(a).ageDays);

  const openTaskCountsByProject = new Map<string, number>();
  const categoryCounts = Object.fromEntries(
    TASK_CATEGORIES.map((c) => [c, 0])
  ) as Record<TaskCategory, number>;
  for (const t of allTasks) {
    if (t.status === "done" || t.archived_at) continue;
    if ((TASK_CATEGORIES as readonly string[]).includes(t.category)) {
      categoryCounts[t.category]++;
    }
    if (t.project_id) {
      openTaskCountsByProject.set(
        t.project_id,
        (openTaskCountsByProject.get(t.project_id) ?? 0) + 1
      );
    }
  }

  return (
    <div className="max-w-6xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <PageHeader
        title="Ops"
        subtitle="Today, this week, projects, categories. Anchor for the day."
      />

      <TasksSurface
        tasks={allTasks}
        projectNames={projectNames}
        currentUser={currentUser}
      />

      <StuckWorkRollup tasks={stuckTasks} projectNames={projectNames} />

      <TodayView
        dueToday={dueToday}
        pinnedToday={pinnedToday}
        projectNames={projectNamesMap}
      />
      <ThisWeekView tasks={pinnedWeek} projectNames={projectNamesMap} />
      <ActiveProjectsList
        projects={activeProjects}
        openTaskCounts={openTaskCountsByProject}
      />
      <CategoryCounts counts={categoryCounts} />
    </div>
  );
}
