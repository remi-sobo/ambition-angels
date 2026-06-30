import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { taskStatusToStatus } from "@/lib/admin/status";
import StatCard from "../../../_components/StatCard";
import { StatusChip } from "@/app/admin/_components/StatusChip";
import {
  ObjectiveCard,
  type PlanObjective,
  type PlanGoal,
  type PlanKpi,
  type PlanInitiative,
  type InitiativeRollup,
} from "../../_components/PlanControls";

// Objective detail (drill-in from the Strategy Org grid): a full page for one
// objective. The editable tree (objective status/owner, goals, measures, and
// initiatives — same CRUD as the plan/Area lens) sits up top, then the actual
// tasks doing the work, grouped by initiative (via initiative -> project ->
// task). Tasks are edited on their ops project page. Org-scoped service-role.
export const dynamic = "force-dynamic";

type ProjectRow = { id: string; title: string; status: string; initiative_id: string | null };
type TaskRow = { id: string; title: string; status: string; assigned_to: string | null; due_date: string | null; project_id: string | null };

const TASK_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export default async function ObjectiveDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  const orgId = ctx.orgId;
  const sb = getSupabaseAdmin();

  const { data: objectiveData } = await sb
    .from("plan_objectives")
    .select("id, title, owner, status, status_override, status_override_reason, three_year_statement, sort_order")
    .eq("id", params.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!objectiveData) notFound();
  const objective = objectiveData as PlanObjective;

  // All objectives in the org, for the goal re-parent dropdown in the tree.
  const { data: allObjectivesData } = await sb
    .from("plan_objectives")
    .select("id, title")
    .eq("org_id", orgId)
    .order("sort_order")
    .order("created_at");
  const objectiveOptions = (allObjectivesData ?? []) as { id: string; title: string }[];

  const { data: goalsData } = await sb
    .from("plan_goals")
    .select("id, objective_id, title, description, target_date, owner, status, status_override, status_override_reason, sort_order")
    .eq("org_id", orgId)
    .eq("objective_id", params.id)
    .order("sort_order")
    .order("created_at");
  const goals = (goalsData ?? []) as PlanGoal[];
  const goalIds = goals.map((g) => g.id);
  const goalIdSet = new Set(goalIds);

  const { data: kpisData } = await sb
    .from("plan_kpis")
    .select("id, goal_id, objective_id, title, unit, target, current, baseline, baseline_date, owner, source, metric_key, status, cadence, last_updated_at")
    .eq("org_id", orgId)
    .limit(500);
  const kpis = ((kpisData ?? []) as PlanKpi[]).filter(
    (k) => k.objective_id === params.id || (k.goal_id && goalIdSet.has(k.goal_id)),
  );

  const initiatives = goalIds.length
    ? (((await sb.from("plan_initiatives").select("id, goal_id, title, owner, status, sort_order").eq("org_id", orgId).in("goal_id", goalIds).order("sort_order").order("created_at")).data ?? []) as PlanInitiative[])
    : [];
  const initIds = initiatives.map((i) => i.id);

  const projects = initIds.length
    ? (((await sb.from("ops_projects").select("id, title, status, initiative_id").eq("org_id", orgId).in("initiative_id", initIds)).data ?? []) as ProjectRow[])
    : [];
  const projIds = projects.map((p) => p.id);
  const projInit = new Map(projects.map((p) => [p.id, p.initiative_id]));

  const tasks = projIds.length
    ? (((await sb.from("ops_tasks").select("id, title, status, assigned_to, due_date, project_id").eq("org_id", orgId).in("project_id", projIds).is("archived_at", null).order("due_date", { ascending: true, nullsFirst: false })).data ?? []) as TaskRow[])
    : [];

  // Group children for the editable tree + the tasks view.
  const kpisByGoal: Record<string, PlanKpi[]> = {};
  for (const k of kpis) if (k.goal_id) (kpisByGoal[k.goal_id] ??= []).push(k);
  const initiativesByGoal: Record<string, PlanInitiative[]> = {};
  for (const i of initiatives) (initiativesByGoal[i.goal_id] ??= []).push(i);
  const projsByInit: Record<string, ProjectRow[]> = {};
  for (const p of projects) if (p.initiative_id) (projsByInit[p.initiative_id] ??= []).push(p);
  const tasksByProject: Record<string, TaskRow[]> = {};
  for (const t of tasks) if (t.project_id) (tasksByProject[t.project_id] ??= []).push(t);
  const goalById = new Map(goals.map((g) => [g.id, g]));

  // Work rollup (tasks done/total per initiative) for the tree's initiative chips.
  const rollups: Record<string, InitiativeRollup> = {};
  for (const p of projects) {
    if (!p.initiative_id) continue;
    (rollups[p.initiative_id] ??= { projects: 0, tasksDone: 0, tasksTotal: 0 }).projects++;
  }
  for (const t of tasks) {
    const initId = t.project_id ? projInit.get(t.project_id) : null;
    if (!initId) continue;
    const r = (rollups[initId] ??= { projects: 0, tasksDone: 0, tasksTotal: 0 });
    r.tasksTotal++;
    if (t.status === "done") r.tasksDone++;
  }

  const initsDone = initiatives.filter((i) => i.status === "done").length;
  const openTasks = tasks.filter((t) => t.status !== "done").length;

  // Initiatives that actually have tasks, with their goal — drives the tasks view.
  const initsWithWork = initiatives.filter((i) => (initiativesByGoal[i.goal_id] && (projsByInit[i.id]?.length ?? 0) > 0));

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1000px]">
      <div className="mb-4">
        <Link href="/admin/strategic-plan" className="text-xs font-semibold text-orange hover:underline">← Strategy</Link>
        {objective.three_year_statement && (
          <p className="text-xs text-ink-2 italic mt-1">3-year · {objective.three_year_statement}</p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Goals" value={goals.length} />
        <StatCard label="Measures" value={kpis.length} />
        <StatCard label="Initiatives done" value={`${initsDone}/${initiatives.length}`} />
        <StatCard label="Open tasks" value={openTasks} muted={openTasks === 0} />
      </div>

      {/* Editable tree: objective status/owner, goals, measures, initiatives + add forms. */}
      <ObjectiveCard
        objective={objective}
        goals={goals}
        kpisByGoal={kpisByGoal}
        initiativesByGoal={initiativesByGoal}
        rollups={rollups}
        objectiveOptions={objectiveOptions}
      />

      {/* The actual tasks doing the work, by initiative. Edited on the ops project page. */}
      <h2 className="font-heading font-bold text-ink-1 text-lg mt-8 mb-3">Tasks</h2>
      {initsWithWork.length === 0 ? (
        <p className="text-sm text-ink-2">
          No tasks yet — attach a project to an initiative on the{" "}
          <Link href="/admin/ops/projects" className="text-orange hover:underline">projects</Link> page, and its tasks will roll up here.
        </p>
      ) : (
        <div className="space-y-4">
          {initsWithWork.map((it) => {
            const goal = goalById.get(it.goal_id);
            const iProjs = projsByInit[it.id] ?? [];
            return (
              <section key={it.id} className="border-[1.5px] border-outline rounded-card-lg p-5 bg-tile/40">
                <div className="mb-2">
                  <h3 className="font-heading font-semibold text-ink-1">{it.title}</h3>
                  {goal && <p className="text-[11px] text-ink-3">↳ {goal.title}</p>}
                </div>
                <div className="space-y-3">
                  {iProjs.map((p) => {
                    const pTasks = tasksByProject[p.id] ?? [];
                    return (
                      <div key={p.id} className="bg-surface border border-hairline rounded-card p-3">
                        <Link href={`/admin/ops/projects/${p.id}`} className="text-[11px] font-semibold text-ink-2 hover:text-orange">
                          {p.title} →
                        </Link>
                        {pTasks.length === 0 ? (
                          <p className="text-[11px] text-ink-3 mt-1">No tasks yet.</p>
                        ) : (
                          <ul className="mt-2 space-y-1">
                            {pTasks.map((t) => (
                              <li key={t.id} className="flex items-center gap-2 text-xs">
                                <StatusChip status={taskStatusToStatus(t.status)}>{TASK_LABEL[t.status] ?? t.status}</StatusChip>
                                <span className={`flex-1 min-w-0 truncate ${t.status === "done" ? "text-ink-3 line-through" : "text-ink-1"}`}>{t.title}</span>
                                {t.assigned_to && <span className="text-[10px] text-ink-3 capitalize shrink-0">{t.assigned_to}</span>}
                                {t.due_date && <span className="text-[10px] text-ink-3 tabular-nums shrink-0">{t.due_date}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
