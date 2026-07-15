import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "../../_components/PageHeader";
import {
  ObjectiveCard,
  GoalCard,
  RefreshMetricsButton,
  type PlanObjective,
  type PlanGoal,
  type PlanKpi,
  type PlanInitiative,
  type PlanObjectiveNote,
  type PlanObjectiveTask,
  type TeamMember,
} from "../_components/PlanControls";
import ReviewComplete from "./_components/ReviewComplete";

// Monthly OGSM review mode (BloomOS Strategy, Phase 4). Walk the four
// objectives, refresh the auto numbers, update the manual KPIs and statuses
// inline (the cards write live), then log the session + set the next date.
export const dynamic = "force-dynamic";

type ReviewRow = { id: string; conducted_at: string; conducted_by: string | null; notes: string | null; next_review_at: string | null };

export default async function StrategyReviewPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  }
  const orgId = ctx.orgId;
  const sb = getSupabaseAdmin();

  const [objectivesRes, goalsRes, kpisRes, initiativesRes, reviewsRes, notesRes, tasksRes, staffRes] = await Promise.all([
    sb.from("plan_objectives").select("*").eq("org_id", orgId).order("sort_order").order("created_at"),
    sb.from("plan_goals").select("*").eq("org_id", orgId).order("sort_order").order("created_at").limit(200),
    sb.from("plan_kpis").select("*").eq("org_id", orgId).order("created_at").limit(500),
    sb.from("plan_initiatives").select("*").eq("org_id", orgId).order("sort_order").order("created_at").limit(1000),
    // Resilient if plan_reviews isn't migrated yet (error → data null).
    sb.from("plan_reviews").select("*").eq("org_id", orgId).order("conducted_at", { ascending: false }).limit(6),
    // Objective-level notes + tasks (resilient if not migrated yet).
    sb.from("plan_objective_notes").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(500),
    sb.from("plan_objective_tasks").select("*").eq("org_id", orgId).order("sort_order").order("created_at").limit(500),
    // Active internal team members for the assignee dropdowns.
    sb.from("staff").select("id, full_name").eq("org_id", orgId).eq("status", "active").order("sort_order").order("full_name"),
  ]);

  const objectives = (objectivesRes.data ?? []) as PlanObjective[];
  const goals = (goalsRes.data ?? []) as PlanGoal[];
  const kpis = (kpisRes.data ?? []) as PlanKpi[];
  const initiatives = (initiativesRes.data ?? []) as PlanInitiative[];
  const reviews = (reviewsRes.data ?? []) as ReviewRow[];
  const objectiveNotes = (notesRes.data ?? []) as PlanObjectiveNote[];
  const objectiveTasks = (tasksRes.data ?? []) as PlanObjectiveTask[];
  const team = (staffRes.data ?? []) as TeamMember[];

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
  const notesByObjective: Record<string, PlanObjectiveNote[]> = {};
  for (const n of objectiveNotes) (notesByObjective[n.objective_id] ??= []).push(n);
  const tasksByObjective: Record<string, PlanObjectiveTask[]> = {};
  for (const t of objectiveTasks) (tasksByObjective[t.objective_id] ??= []).push(t);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1000px]">
      <PageHeader
        title="Monthly OGSM Review"
        subtitle={
          <>
            Walk the objectives, refresh the numbers, update what changed, then log it · back to the{" "}
            <Link href="/admin/strategic-plan" className="text-orange hover:underline">full plan</Link>
          </>
        }
        actions={<RefreshMetricsButton />}
      />

      {objectives.length === 0 && orphanGoals.length === 0 ? (
        <p className="text-sm text-ink-2">
          No strategy to review yet — <Link href="/admin/strategic-plan" className="text-orange hover:underline">load the AA strategy</Link> first.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-ink-2">
            Step 1 — hit <strong>↻ Refresh metrics</strong> to pull the latest auto numbers. Step 2 — walk each
            objective below, update the manual measures and statuses. Step 3 — log the review at the bottom.
          </p>

          {objectives.map((o) => (
            <ObjectiveCard
              key={o.id}
              objective={o}
              goals={goalsByObjective[o.id] ?? []}
              kpisByGoal={kpisByGoal}
              initiativesByGoal={initiativesByGoal}
              team={team}
              notes={notesByObjective[o.id] ?? []}
              tasks={tasksByObjective[o.id] ?? []}
            />
          ))}

          {orphanGoals.length > 0 && (
            <section className="border-[1.5px] border-dashed border-outline rounded-card-lg p-5">
              <h2 className="font-heading font-semibold text-ink-2 text-sm mb-3">Goals without an objective</h2>
              <div className="space-y-3">
                {orphanGoals.map((g) => (
                  <GoalCard key={g.id} goal={g} kpis={kpisByGoal[g.id] ?? []} initiatives={initiativesByGoal[g.id] ?? []} />
                ))}
              </div>
            </section>
          )}

          <ReviewComplete />

          {reviews.length > 0 && (
            <section className="border-[1.5px] border-outline rounded-card-lg p-5">
              <h2 className="font-heading font-semibold text-ink-1 text-sm mb-3">Review history</h2>
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="text-sm border-b border-outline last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink-1">{fmtDate(r.conducted_at)}</span>
                      {r.conducted_by && <span className="text-[11px] text-ink-2">{r.conducted_by}</span>}
                      {r.next_review_at && (
                        <span className="text-[11px] text-ink-2 ml-auto">next: {r.next_review_at}</span>
                      )}
                    </div>
                    {r.notes && <p className="text-ink-2 mt-1 whitespace-pre-wrap">{r.notes}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
