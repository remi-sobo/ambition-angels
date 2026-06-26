import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import ReedReviewButton from "./_components/ReedReviewButton";
import ReedDesignButton from "./_components/ReedDesignButton";
import ReedStartButton from "./_components/ReedStartButton";
import { deriveHealth, worstHealth, isOffTrack } from "@/lib/admin/plan/health";
import { resolveOwner, ownerValue, matchOwner, ownerRank } from "@/lib/admin/plan/owners";
import { measureFreshness } from "@/lib/admin/plan/freshness";
import { getUnassignedPlanMetrics } from "@/lib/admin/plan/metrics";
import PageHeader from "../_components/PageHeader";
import StatCard from "../_components/StatCard";
import StrategyGlance from "./_components/StrategyGlance";
import StrategyControls, { type LensKey } from "./_components/StrategyControls";
import UnassignedMetrics from "./_components/UnassignedMetrics";
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

// Strategic plan (BloomOS Strategy — specs/bloomos-strategy-command-center.md):
// one spine, three lenses. Org = the glance (verdict + grid, B1). Area = the
// editable Foundation → Objectives → Goals → KPIs + Initiatives tree, scoped and
// filtered. Mine = that tree filtered to what the viewer owns. Lens + filters are
// URL-synced (B2). All reads org-scoped on the service-role client.
export const dynamic = "force-dynamic";

const str = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" ? v : undefined;

// Health filter over a rolled-up health value.
function matchStatus(health: string, filter: string): boolean {
  switch (filter) {
    case "off_track":
      return isOffTrack(health);
    case "on_track":
      return health === "on_track";
    case "done":
      return health === "done";
    case "not_started":
      return health === "not_started";
    default:
      return true;
  }
}

export default async function StrategicPlanPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  }
  const orgId = ctx.orgId;
  const currentUser = (await getAdminUser()) ?? "remi";
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

  // ── Lens + filters (URL-synced, B2) ────────────────────────────────────────
  const yoursLens: LensKey = ctx.role === "owner" || ctx.role === "admin" ? "org" : "mine";
  const lensParam = str(searchParams?.lens);
  const lens: LensKey =
    lensParam === "area" || lensParam === "mine" || lensParam === "org" ? lensParam : yoursLens;
  const areaFilter = str(searchParams?.area);
  const ownerFilter = str(searchParams?.owner);
  const statusFilter = str(searchParams?.status);
  const reviewFilter = str(searchParams?.review);

  // Rolled-up health for an objective (KPI statuses worst-wins, honoring the
  // manually-set objective status) — the same rule the glance and cockpit use.
  const objectiveHealth = (o: PlanObjective): string => {
    const sts = (goalsByObjective[o.id] ?? []).flatMap((g) => (kpisByGoal[g.id] ?? []).map((k) => k.status));
    return worstHealth(deriveHealth(sts), o.status) ?? o.status;
  };

  // Owner dropdown options: every distinct resolved owner across the plan.
  const ownerOptionMap = new Map<string, string>();
  const addOwner = (s: string | null) => {
    const r = resolveOwner(s);
    if (r) ownerOptionMap.set(ownerValue(r), r.label);
  };
  objectives.forEach((o) => addOwner(o.owner));
  goals.forEach((g) => addOwner(g.owner));
  kpis.forEach((k) => addOwner(k.owner));
  initiatives.forEach((i) => addOwner(i.owner));
  const ownerOptions = Array.from(ownerOptionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => ownerRank(a.value) - ownerRank(b.value) || a.label.localeCompare(b.label));

  // The owner we filter to: locked to the viewer in Mine, the dropdown in Area.
  const ownerTarget = lens === "mine" ? currentUser : lens === "area" ? ownerFilter : undefined;

  // A goal is "owned" by the target if the goal, its objective, or any of its
  // KPIs/initiatives carries that owner — so an objective surfaces when any work
  // under it is theirs, not only when the objective itself is tagged.
  const goalOwnedBy = (g: PlanGoal, objOwner: string | null, target: string): boolean =>
    matchOwner(objOwner, target) ||
    matchOwner(g.owner, target) ||
    (kpisByGoal[g.id] ?? []).some((k) => matchOwner(k.owner, target)) ||
    (initiativesByGoal[g.id] ?? []).some((i) => matchOwner(i.owner, target));

  // "Due for review": a goal carrying a measure gone stale past its cadence.
  const goalHasStale = (g: PlanGoal): boolean =>
    (kpisByGoal[g.id] ?? []).some((k) => measureFreshness(k.last_updated_at, k.cadence).stale);

  // Build the filtered tree for the Area / Mine lenses.
  const keptGoalsByObjective: Record<string, PlanGoal[]> = {};
  const treeObjectives = objectives.filter((o) => {
    if (areaFilter && o.id !== areaFilter) return false;
    if (statusFilter && !matchStatus(objectiveHealth(o), statusFilter)) return false;
    let gs = goalsByObjective[o.id] ?? [];
    if (ownerTarget) {
      gs = gs.filter((g) => goalOwnedBy(g, o.owner, ownerTarget));
      if (!matchOwner(o.owner, ownerTarget) && gs.length === 0) return false;
    }
    if (reviewFilter === "due" && !gs.some(goalHasStale)) return false;
    keptGoalsByObjective[o.id] = gs;
    return true;
  });

  // Orphan goals (no objective): only when no area is selected; same owner/status filters.
  const treeOrphans = areaFilter
    ? []
    : orphanGoals.filter((g) => {
        if (statusFilter && !matchStatus(g.status, statusFilter)) return false;
        if (ownerTarget && !goalOwnedBy(g, null, ownerTarget)) return false;
        if (reviewFilter === "due" && !goalHasStale(g)) return false;
        return true;
      });

  // Unassigned vital signs (Org lens only): live metrics not yet bound to a goal,
  // plus the goal list the tray attaches them to.
  const unassignedMetrics = lens === "org" && !isEmpty ? await getUnassignedPlanMetrics(supabase, orgId) : [];
  const objTitleById = new Map(objectives.map((o) => [o.id, o.title]));
  const goalOptions = goals.map((g) => ({
    id: g.id,
    title: g.title,
    objectiveTitle: g.objective_id ? objTitleById.get(g.objective_id) ?? null : null,
  }));

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
          <div className="flex items-center gap-2 flex-wrap">
            {!isEmpty && (
              <Link
                href="/admin/strategic-plan/scorecard"
                className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
              >
                KPI Scorecard
              </Link>
            )}
            {!isEmpty && (
              <Link
                href="/admin/strategic-plan/narrative"
                className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] px-4 py-2 rounded-full transition-colors"
              >
                Narrative
              </Link>
            )}
            <Link
              href="/admin/strategic-plan/setup"
              className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] px-4 py-2 rounded-full transition-colors"
            >
              Set up
            </Link>
            {!isEmpty && (
              <Link
                href="/admin/strategic-plan/people"
                className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] px-4 py-2 rounded-full transition-colors"
              >
                People
              </Link>
            )}
            {!isEmpty && (
              <Link
                href="/admin/strategic-plan/review"
                className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] px-4 py-2 rounded-full transition-colors"
              >
                Monthly review
              </Link>
            )}
            {!isEmpty && <ReedReviewButton />}
            {!isEmpty && <ReedDesignButton />}
            {isEmpty && <ReedStartButton />}
            {isEmpty ? <SeedButton /> : <RefreshMetricsButton />}
            <NewObjectiveForm />
          </div>
        }
      />

      {isEmpty ? (
        <>
          <FoundationPanel foundation={foundation} />
          <p className="text-sm text-ink-2">
            No strategy yet — click <strong>Load AA strategy</strong> to bring in the foundation, four objectives,
            goals, and KPIs from the OGSM, or add an objective to build it from scratch.
          </p>
        </>
      ) : (
        <>
          <StrategyControls
            lens={lens}
            yoursLens={yoursLens}
            areas={objectives.map((o) => ({ id: o.id, title: o.title }))}
            owners={ownerOptions}
            current={{ area: areaFilter ?? "all", owner: ownerFilter ?? "all", status: statusFilter ?? "all", review: reviewFilter ?? "all" }}
          />

          {lens === "org" ? (
            <>
              {/* Org lens: the verdict, exceptions, objective grid (B1), the unassigned tray, the counts, the why. */}
              <StrategyGlance />
              <UnassignedMetrics metrics={unassignedMetrics} goals={goalOptions} />
              <div className="grid grid-cols-4 gap-3 mb-8">
                <StatCard label="Objectives" value={objectives.length} />
                <StatCard label="Goals" value={goals.length} />
                <StatCard label="Initiatives done" value={`${doneInits}/${initiatives.length}`} />
                <StatCard label="At risk / behind" value={atRisk} muted={atRisk === 0} />
              </div>
              <FoundationPanel foundation={foundation} />
            </>
          ) : treeObjectives.length === 0 && treeOrphans.length === 0 ? (
            <p className="text-sm text-ink-2">
              {lens === "mine"
                ? "Nothing is assigned to you under the current filters."
                : "No objectives match the current filters."}
            </p>
          ) : (
            <div className="space-y-5">
              {treeObjectives.map((o) => (
                <ObjectiveCard
                  key={o.id}
                  objective={o}
                  goals={keptGoalsByObjective[o.id] ?? []}
                  kpisByGoal={kpisByGoal}
                  initiativesByGoal={initiativesByGoal}
                  rollups={rollups}
                />
              ))}

              {treeOrphans.length > 0 && (
                <section className="border-[1.5px] border-dashed border-outline rounded-card-lg p-5">
                  <h2 className="font-heading font-semibold text-ink-2 text-sm mb-3">Goals without an objective</h2>
                  <div className="space-y-3">
                    {treeOrphans.map((g) => (
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
        </>
      )}
    </div>
  );
}
