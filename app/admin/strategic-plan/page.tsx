import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "../_components/PageHeader";
import StatCard from "../_components/StatCard";
import {
  FoundationPanel,
  ObjectiveCard,
  GoalCard,
  NewObjectiveForm,
  NewGoalForm,
  SeedButton,
  RefreshMetricsButton,
  type PlanFoundation,
  type PlanObjective,
  type PlanGoal,
  type PlanKpi,
  type PlanInitiative,
  type InitiativeRollup,
} from "./_components/PlanControls";

// Strategic plan (BloomOS Strategy, Phase 1 — specs/bloomos-strategy.md):
// Foundation → Objectives → Goals → KPIs + Initiatives, the system of record
// that retires KeyneLink and the OGSM PDF. All reads are org-scoped on the
// service-role client (the page's tenant boundary; see the plan routes).
export const dynamic = "force-dynamic";

export default async function StrategicPlanPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  }
  const orgId = ctx.orgId;
  const supabase = getSupabaseAdmin();

  const [foundationRes, objectivesRes, goalsRes, kpisRes, initiativesRes, projectsRes] =
    await Promise.all([
      supabase.from("plan_foundation").select("*").eq("org_id", orgId).maybeSingle(),
      supabase.from("plan_objectives").select("*").eq("org_id", orgId).order("sort_order").order("created_at"),
      supabase.from("plan_goals").select("*").eq("org_id", orgId).order("sort_order").order("created_at").limit(200),
      supabase.from("plan_kpis").select("*").eq("org_id", orgId).order("created_at").limit(500),
      supabase.from("plan_initiatives").select("*").eq("org_id", orgId).order("sort_order").order("created_at").limit(1000),
      // Phase 2 cascade: projects attached to an initiative, for the work rollup.
      supabase.from("ops_projects").select("id, initiative_id").eq("org_id", orgId).not("initiative_id", "is", null),
    ]);

  const foundation = (foundationRes.data ?? null) as PlanFoundation;
  const objectives = (objectivesRes.data ?? []) as PlanObjective[];
  const goals = (goalsRes.data ?? []) as PlanGoal[];
  const kpis = (kpisRes.data ?? []) as PlanKpi[];
  const initiatives = (initiativesRes.data ?? []) as PlanInitiative[];

  // Work rollup: task completion → project → initiative. For each attached
  // project we tally its tasks (done / total); we sum those per initiative so
  // attaching a project and closing its tasks visibly moves the initiative.
  const attachedProjects = (projectsRes.data ?? []) as { id: string; initiative_id: string | null }[];
  const initiativeOfProject = new Map(attachedProjects.map((p) => [p.id, p.initiative_id]));
  const rollups: Record<string, InitiativeRollup> = {};
  for (const p of attachedProjects) {
    if (!p.initiative_id) continue;
    (rollups[p.initiative_id] ??= { projects: 0, tasksDone: 0, tasksTotal: 0 }).projects++;
  }
  if (attachedProjects.length > 0) {
    const { data: taskRows } = await supabase
      .from("ops_tasks")
      .select("project_id, status")
      .in("project_id", attachedProjects.map((p) => p.id))
      .is("archived_at", null);
    for (const t of (taskRows ?? []) as { project_id: string | null; status: string }[]) {
      const initId = t.project_id ? initiativeOfProject.get(t.project_id) : null;
      if (!initId) continue;
      const r = (rollups[initId] ??= { projects: 0, tasksDone: 0, tasksTotal: 0 });
      r.tasksTotal++;
      if (t.status === "done") r.tasksDone++;
    }
  }

  // Group children by parent for O(1) lookups in the tree.
  const goalsByObjective: Record<string, PlanGoal[]> = {};
  const orphanGoals: PlanGoal[] = [];
  for (const g of goals) {
    if (g.objective_id) (goalsByObjective[g.objective_id] ??= []).push(g);
    else orphanGoals.push(g);
  }
  const kpisByGoal: Record<string, PlanKpi[]> = {};
  for (const k of kpis) if (k.goal_id) (kpisByGoal[k.goal_id] ??= []).push(k);
  const initiativesByGoal: Record<string, PlanInitiative[]> = {};
  for (const i of initiatives) (initiativesByGoal[i.goal_id] ??= []).push(i);

  const isEmpty = objectives.length === 0 && goals.length === 0;
  const flagged = (s: string) => s === "at_risk" || s === "behind";
  const atRisk =
    objectives.filter((o) => flagged(o.status)).length +
    goals.filter((g) => flagged(g.status)).length +
    kpis.filter((k) => flagged(k.status)).length;
  const doneInits = initiatives.filter((i) => i.status === "done").length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1000px]">
      <PageHeader
        title="Strategic Plan"
        subtitle={
          <>
            Foundation → objectives → goals → measures, wired to the work · the framing deck lives in the{" "}
            <Link href="/strategy" className="text-orange hover:underline">Strategy Room</Link>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {!isEmpty && (
              <Link
                href="/admin/strategic-plan/review"
                className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] px-4 py-2 rounded-full transition-colors"
              >
                Monthly review
              </Link>
            )}
            {isEmpty ? <SeedButton /> : <RefreshMetricsButton />}
            <NewObjectiveForm />
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-3 mb-8">
        <StatCard label="Objectives" value={objectives.length} />
        <StatCard label="Goals" value={goals.length} />
        <StatCard label="Initiatives done" value={`${doneInits}/${initiatives.length}`} />
        <StatCard
          label="At risk / behind"
          value={atRisk}
          muted={atRisk === 0}
        />
      </div>

      <FoundationPanel foundation={foundation} />

      {isEmpty ? (
        <p className="text-sm text-ink-2">
          No strategy yet — click <strong>Load AA strategy</strong> to bring in the foundation, four objectives,
          goals, and KPIs from the OGSM, or add an objective to build it from scratch.
        </p>
      ) : (
        <div className="space-y-5">
          {objectives.map((o) => (
            <ObjectiveCard
              key={o.id}
              objective={o}
              goals={goalsByObjective[o.id] ?? []}
              kpisByGoal={kpisByGoal}
              initiativesByGoal={initiativesByGoal}
              rollups={rollups}
            />
          ))}

          {orphanGoals.length > 0 && (
            <section className="border-[1.5px] border-dashed border-outline rounded-card-lg p-5">
              <h2 className="font-heading font-semibold text-ink-2 text-sm mb-3">Goals without an objective</h2>
              <div className="space-y-3">
                {orphanGoals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    kpis={kpisByGoal[g.id] ?? []}
                    initiatives={initiativesByGoal[g.id] ?? []}
                    rollups={rollups}
                  />
                ))}
              </div>
            </section>
          )}

          <div className="pt-2"><NewGoalForm /></div>
        </div>
      )}
    </div>
  );
}
