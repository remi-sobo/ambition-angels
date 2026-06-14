import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  CATEGORIES,
  todayISO,
  type Category,
  type OpsProject,
  type OpsTask,
} from "./_types/ops";
import TodayView from "./_components/TodayView";
import ThisWeekView from "./_components/ThisWeekView";
import ActiveProjectsList from "./_components/ActiveProjectsList";
import CategoryCounts from "./_components/CategoryCounts";
import PageHeader from "../_components/PageHeader";

// Force dynamic — this page is task-state-dependent; we don't want a
// stale ISR cache to lie about "what's due today."
export const dynamic = "force-dynamic";

export default async function OpsLandingPage() {
  const supabase = getSupabaseAdmin();
  const today = todayISO();

  // All ops queries fan out in parallel. We deliberately pull a bit more
  // than each section needs in some places, so we can build the
  // openTaskCounts / projectNames maps without an extra round trip.
  const [
    dueTodayRes,
    pinnedTodayRes,
    pinnedWeekRes,
    activeProjectsRes,
    openTasksRes,
  ] = await Promise.all([
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("due_date", today)
      .neq("status", "done")
      .order("created_at", { ascending: false }),
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("pinned_for_today", true)
      .neq("status", "done")
      .order("created_at", { ascending: false }),
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("pinned_for_this_week", true)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: true }),
    supabase
      .from("ops_projects")
      .select("*")
      .eq("status", "active")
      .order("last_touched_at", { ascending: false })
      .limit(10),
    // Open tasks, just the columns we need to build counts.
    supabase
      .from("ops_tasks")
      .select("category, project_id, status")
      .neq("status", "done"),
  ]);

  const dueToday = (dueTodayRes.data as OpsTask[] | null) ?? [];
  const rawPinnedToday = (pinnedTodayRes.data as OpsTask[] | null) ?? [];
  // Drop pinned-for-today rows that are already in "Due today" so we
  // don't double-render the same task.
  const dueTodayIds = new Set(dueToday.map((t) => t.id));
  const pinnedToday = rawPinnedToday.filter(
    (t) => !dueTodayIds.has(t.id) && t.due_date !== today
  );
  const pinnedWeek = (pinnedWeekRes.data as OpsTask[] | null) ?? [];
  const activeProjects = (activeProjectsRes.data as OpsProject[] | null) ?? [];

  // Build a project name lookup for TaskRow links. Only need it for
  // project_ids actually referenced from rendered rows.
  const referencedProjectIds = new Set<string>();
  for (const t of [...dueToday, ...pinnedToday, ...pinnedWeek]) {
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
  for (const p of activeProjects) projectNames.set(p.id, p.title);

  const openTasks =
    (openTasksRes.data as Array<{ category: string; project_id: string | null }> | null) ?? [];

  const categoryCounts: Record<Category, number> = {
    fundraising: 0,
    admin: 0,
    board: 0,
    recruitment: 0,
    program: 0,
    finance: 0,
    compliance: 0,
    other: 0,
  };
  const openTaskCountsByProject = new Map<string, number>();
  for (const row of openTasks) {
    if (CATEGORIES.includes(row.category as Category)) {
      categoryCounts[row.category as Category]++;
    }
    if (row.project_id) {
      openTaskCountsByProject.set(
        row.project_id,
        (openTaskCountsByProject.get(row.project_id) ?? 0) + 1
      );
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Ops"
        subtitle="Today, this week, projects, categories. Anchor for the day."
      />

      <TodayView
        dueToday={dueToday}
        pinnedToday={pinnedToday}
        projectNames={projectNames}
      />
      <ThisWeekView tasks={pinnedWeek} projectNames={projectNames} />
      <ActiveProjectsList
        projects={activeProjects}
        openTaskCounts={openTaskCountsByProject}
      />
      <CategoryCounts counts={categoryCounts} />
    </div>
  );
}
