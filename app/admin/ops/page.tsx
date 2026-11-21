import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser, getOrgContext } from "@/lib/admin/auth";
import { loadStuckProjectContext } from "@/lib/admin/ops/stuck-context";
import {
  readTaskHealth,
  todayISO,
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
import Figure, { SummaryStrip } from "../_components/ui/Figure";
import Notice from "../_components/ui/Notice";
import NewTaskButton from "./_components/NewTaskButton";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

// Force dynamic — this page is task-state-dependent; we don't want a
// stale ISR cache to lie about "what's due today."
export const dynamic = "force-dynamic";

export default async function OpsLandingPage({
  searchParams,
}: {
  searchParams?: { assignee?: string | string[] };
}) {
  const roleGate = await requirePagePermission("ops.read", "Operations");
  if (!roleGate.ok) return roleGate.page;
  const supabase = getSupabaseAdmin();
  const today = todayISO();
  const currentUser = await getAdminUser();
  // Org fence: the service-role client bypasses RLS, so every read below MUST
  // filter by the active org. Without a session there's no org — render empty.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
        <PageHeader title="Tasks" subtitle="Sign in to view your organization's work." />
      </div>
    );
  }
  const orgId = ctx.orgId;

  // Mirror the assignee filter that TasksSurface keeps in the URL (?assignee=),
  // so a person-filtered view scopes the whole landing — Today and This Week —
  // not just the main list. Changing the dropdown re-renders this (force-dynamic)
  // page with the new param.
  const rawAssignee = Array.isArray(searchParams?.assignee)
    ? searchParams?.assignee[0]
    : searchParams?.assignee;
  const assignee = rawAssignee?.trim() ? rawAssignee.trim() : "all";
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
      .eq("org_id", orgId)
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
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("last_touched_at", { ascending: false })
      .limit(10),
  ]);

  const allTasks = (allTasksRes.data as OpsTask[] | null) ?? [];
  const readFailed = !!allTasksRes.error;
  // The page reads up to 1,000 tasks; say so if it hit the cap.
  const capped = allTasks.length >= 1000;
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
      .eq("org_id", orgId)
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

  // Project context (title + donor/partnership identifiers) for the stuck
  // cards — small lookups scoped to just the projects stuck tasks reference,
  // and no queries at all when there are none.
  const stuckProjectContext = await loadStuckProjectContext(
    supabase,
    stuckTasks,
    allTasks,
    orgId
  );

  // Open (not done, not archived) tasks — feeds the per-project counts and
  // the By Category panel, which derives its own counts + expandable lists
  // from this same array so the two can never disagree.
  const openTasks = allTasks.filter((t) => t.status !== "done" && !t.archived_at);
  const openTaskCountsByProject = new Map<string, number>();
  for (const t of openTasks) {
    if (t.project_id) {
      openTaskCountsByProject.set(
        t.project_id,
        (openTaskCountsByProject.get(t.project_id) ?? 0) + 1
      );
    }
  }

  // Summary strip (spec §5 List: "Summary strip"; every figure sourced).
  const mine = (t: OpsTask) => matchesAssignee(t);
  const openMine = openTasks.filter(mine);
  const overdue = openMine.filter((t) => t.due_date && t.due_date < today).length;
  const oldestLate = openMine
    .filter((t) => t.due_date && t.due_date < today)
    .reduce<string | null>((min, t) => (!min || (t.due_date as string) < min ? (t.due_date as string) : min), null);
  const lateDays = oldestLate ? Math.round((Date.parse(today) - Date.parse(oldestLate)) / 86_400_000) : 0;
  const scopeNote = assignee === "all" ? "everyone" : assignee === "unassigned" ? "unassigned tasks" : assignee;
  const value = (n: number) => (readFailed ? null : n);

  return (
    <div className="max-w-workspace px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title="Tasks"
        subtitle="What is due, what is stuck and what is next, for the whole team"
        primaryAction={<NewTaskButton currentUser={currentUser} />}
        moreActions={[
          { label: "Plan & Close", href: "/admin/work/plan-close" },
          { label: "My Week", href: "/admin/work/my-week" },
          { label: "Projects", href: "/admin/work/projects" },
          { label: "Archived tasks", href: "/admin/work/tasks?scope=archived" },
        ]}
      />

      {readFailed ? (
        <div className="mb-4">
          <Notice tone="danger" title="Tasks failed to load.">
            Reload to retry. Nothing below is a real zero.
          </Notice>
        </div>
      ) : capped ? (
        <div className="mb-4">
          <Notice tone="partial" title="Showing the first 1,000 tasks.">
            Archive finished work to bring older tasks into view.
          </Notice>
        </div>
      ) : null}

      <SummaryStrip label="Task summary">
        <Figure label="Open" value={value(openMine.length)} source={`Not done or archived, for ${scopeNote}`} />
        <Figure label="Due today" value={value(dueToday.length)} source="Due today and not done" />
        <Figure
          label="Late"
          value={value(overdue)}
          source="Open and past their due date"
          compare={overdue > 0 ? `Oldest is ${lateDays} ${lateDays === 1 ? "day" : "days"} late` : undefined}
          compareTone="danger"
        />
        <Figure label="Stuck" value={value(stuckTasks.length)} source="Whole team: open 14 days or more, untouched for a week" />
      </SummaryStrip>

      <div className="space-y-6">
        <TasksSurface tasks={allTasks} projectNames={projectNames} currentUser={currentUser} />

        <StuckWorkRollup tasks={stuckTasks} projectNames={projectNames} projectContext={stuckProjectContext} />

        <TodayView dueToday={dueToday} pinnedToday={pinnedToday} projectNames={projectNamesMap} />
        <ThisWeekView tasks={pinnedWeek} projectNames={projectNamesMap} />
        <ActiveProjectsList projects={activeProjects} openTaskCounts={openTaskCountsByProject} />
        <CategoryCounts tasks={openTasks} projectNames={projectNames} />
      </div>
    </div>
  );
}
