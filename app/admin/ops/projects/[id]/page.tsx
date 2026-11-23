import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import ProjectHeader, { ProjectMoreActions, type InitiativeOption } from "./_components/ProjectHeader";
import PageHeader, { IdentityChip } from "@/app/admin/_components/PageHeader";
import NextStepBar from "@/app/admin/_components/ui/NextStepBar";
import Figure, { SummaryStrip } from "@/app/admin/_components/ui/Figure";
import { ButtonLink } from "@/app/admin/_components/ui/Button";
import { daysBetween, projectNextStep } from "@/lib/admin/ops/projectList";
import ProjectDescription from "./_components/ProjectDescription";
import ProjectTaskList from "./_components/ProjectTaskList";
import ProjectActivityLog from "./_components/ProjectActivityLog";
import { categoryLabel, formatDueLabel, formatRelative, todayISO, type OpsProject, type OpsTask } from "../../_types/ops";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const roleGate = await requirePagePermission("ops.read", "Operations");
  if (!roleGate.ok) return roleGate.page;
  const supabase = getSupabaseAdmin();
  const ctx = await getOrgContext();
  // Org fence: the service-role client bypasses RLS. Without an org the project
  // and task reads below would return ANY tenant's rows by id (IDOR), so treat
  // a missing org as not-found.
  if (!ctx) notFound();
  const orgId = ctx.orgId;

  const [projectRes, tasksRes, initiativesRes, goalsRes] = await Promise.all([
    supabase
      .from("ops_projects")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("org_id", orgId)
      .eq("project_id", params.id)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    // Initiatives the project can attach to (Phase 2 cascade). Org-scoped.
    supabase.from("plan_initiatives").select("id, title, goal_id").eq("org_id", orgId),
    supabase.from("plan_goals").select("id, title").eq("org_id", orgId),
  ]);

  const project = projectRes.data as OpsProject | null;
  // A row for a different org (or a bad id) reads as not-found — never leak
  // its existence.
  if (!project) notFound();

  const tasks = (tasksRes.data as OpsTask[] | null) ?? [];

  // Build "Goal · Initiative" labels so the attach dropdown reads in context.
  const goalTitle = new Map(
    ((goalsRes.data as { id: string; title: string }[] | null) ?? []).map((g) => [g.id, g.title])
  );
  const initiatives: InitiativeOption[] = (
    (initiativesRes.data as { id: string; title: string; goal_id: string | null }[] | null) ?? []
  ).map((i) => {
    const g = i.goal_id ? goalTitle.get(i.goal_id) : undefined;
    const prefix = g ? `${g.length > 40 ? g.slice(0, 40) + "…" : g} · ` : "";
    return { id: i.id, label: `${prefix}${i.title}` };
  });

  const today = todayISO();
  const open = tasks.filter((t) => t.status !== "done" && !t.archived_at);
  const done = tasks.filter((t) => t.status === "done");
  const lateTasks = open.filter((t) => t.due_date && t.due_date < today);
  const next = projectNextStep(project, open.length, today);
  // The next step names the first open task in the project's own order when
  // the project itself is on track.
  const firstOpen = open[0];
  const late = next.tone === "late" && project.due_date ? daysBetween(project.due_date, today) : 0;
  const onTask = next.tone !== "late" && !!project.assigned_to && !!firstOpen;
  const stepTitle = late > 0 ? "Set a new date or close the project." : onTask ? firstOpen.title : next.text;
  const stepDue =
    late > 0
      ? { text: `${late} ${late === 1 ? "day" : "days"} late.`, late: true }
      : onTask && firstOpen.due_date
        ? { text: `Due ${formatDueLabel(firstOpen.due_date)}`, late: firstOpen.due_date < today }
        : undefined;

  return (
    <div className="max-w-workspace px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        breadcrumb={[{ label: "Projects", href: "/admin/work/projects" }]}
        title={project.title}
        chips={
          <>
            <IdentityChip>{categoryLabel(project.status)}</IdentityChip>
            <IdentityChip>{categoryLabel(project.category)}</IdentityChip>
            {project.assigned_to ? (
              <IdentityChip initials={project.assigned_to.charAt(0).toUpperCase()}>
                Owner: <span className="capitalize">{project.assigned_to}</span>
              </IdentityChip>
            ) : (
              <IdentityChip>No owner</IdentityChip>
            )}
          </>
        }
        moreActions={<ProjectMoreActions project={project} />}
        primaryAction={<ButtonLink variant="primary" href="#new-task">Add a task</ButtonLink>}
      />

      <NextStepBar
        title={stepTitle}
        due={stepDue}
        meta={
          onTask
            ? `The first open task, in this project's order${firstOpen?.assigned_to ? `, owned by ${firstOpen.assigned_to.charAt(0).toUpperCase()}${firstOpen.assigned_to.slice(1)}` : ""}.`
            : project.due_date
              ? `Project due ${formatDueLabel(project.due_date)}.`
              : "No due date on this project."
        }
      />

      <SummaryStrip label="Project summary">
        <Figure label="Open tasks" value={tasksRes.error ? null : open.length} source="Not done or archived, from this project's tasks" />
        <Figure label="Done" value={tasksRes.error ? null : done.length} source={`Of ${tasks.length} tasks in this project`} />
        <Figure
          label="Late tasks"
          value={tasksRes.error ? null : lateTasks.length}
          source="Open and past their due date"
          compareTone="danger"
        />
        <Figure
          label="Due"
          value={project.due_date ? formatDueLabel(project.due_date) : "No date set"}
          source={`Project due date, last touched ${formatRelative(project.last_touched_at)}`}
        />
      </SummaryStrip>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="space-y-6 min-w-0">
          <ProjectTaskList
            projectId={project.id}
            projectCategory={project.category}
            projectAssignedTo={project.assigned_to}
            initialTasks={tasks}
          />
          <ProjectActivityLog project={project} tasks={tasks} />
        </div>
        <div className="space-y-6 min-w-0">
          <ProjectHeader project={project} initiatives={initiatives} />
          <ProjectDescription projectId={project.id} description={project.description} />
        </div>
      </div>
    </div>
  );
}
