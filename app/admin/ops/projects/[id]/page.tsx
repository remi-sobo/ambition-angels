import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import ProjectHeader, { type InitiativeOption } from "./_components/ProjectHeader";
import ProjectDescription from "./_components/ProjectDescription";
import ProjectTaskList from "./_components/ProjectTaskList";
import ProjectActivityLog from "./_components/ProjectActivityLog";
import type { OpsProject, OpsTask } from "../../_types/ops";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = getSupabaseAdmin();
  const ctx = await getOrgContext();
  const orgId = ctx?.orgId;

  const [projectRes, tasksRes, initiativesRes, goalsRes] = await Promise.all([
    supabase
      .from("ops_projects")
      .select("*")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("ops_tasks")
      .select("*")
      .eq("project_id", params.id)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    // Initiatives the project can attach to (Phase 2 cascade). Org-scoped.
    orgId
      ? supabase.from("plan_initiatives").select("id, title, goal_id").eq("org_id", orgId)
      : Promise.resolve({ data: [] as { id: string; title: string; goal_id: string | null }[] }),
    orgId
      ? supabase.from("plan_goals").select("id, title").eq("org_id", orgId)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  const project = projectRes.data as OpsProject | null;
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

  return (
    <div className="max-w-6xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <Link
        href="/admin/ops/projects"
        className="inline-block text-xs text-ink-2 hover:text-ink-1 transition-colors"
      >
        ← Back to Projects
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <ProjectHeader project={project} initiatives={initiatives} />
          <ProjectDescription
            projectId={project.id}
            description={project.description}
          />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <ProjectTaskList
            projectId={project.id}
            projectCategory={project.category}
            projectAssignedTo={project.assigned_to}
            initialTasks={tasks}
          />
        </div>
      </div>

      <ProjectActivityLog project={project} tasks={tasks} />
    </div>
  );
}
