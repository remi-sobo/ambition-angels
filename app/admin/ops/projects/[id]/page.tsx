import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import ProjectHeader from "./_components/ProjectHeader";
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
  const [projectRes, tasksRes] = await Promise.all([
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
  ]);

  const project = projectRes.data as OpsProject | null;
  if (!project) notFound();

  const tasks = (tasksRes.data as OpsTask[] | null) ?? [];

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
          <ProjectHeader project={project} />
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
