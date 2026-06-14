import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PageHeader from "../_components/PageHeader";
import StatCard from "../_components/StatCard";
import {
  GoalCard,
  NewGoalForm,
  type PlanGoal,
  type PlanInitiative,
} from "./_components/PlanControls";

// Strategic plan (Ring 4, modules/07-governance.md): goals → initiatives,
// kept alive by being wired to actual work. Progress = done initiatives.
export const dynamic = "force-dynamic";

export default async function StrategicPlanPage() {
  const supabase = getSupabaseAdmin();
  const [goalsRes, initiativesRes] = await Promise.all([
    supabase.from("plan_goals").select("*").order("sort_order").order("created_at").limit(50),
    supabase.from("plan_initiatives").select("*").order("sort_order").order("created_at").limit(500),
  ]);
  const goals = (goalsRes.data ?? []) as PlanGoal[];
  const initiatives = (initiativesRes.data ?? []) as PlanInitiative[];

  const active = goals.filter((g) => g.status !== "done");
  const doneInits = initiatives.filter((i) => i.status === "done").length;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1000px]">
      <PageHeader
        title="Strategic Plan"
        subtitle={
          <>
            Goals → initiatives, wired to the work · the framing deck lives in the{" "}
            <Link href="/strategy" className="text-orange hover:underline">
              Strategy Room
            </Link>
          </>
        }
        actions={<NewGoalForm />}
      />

      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard label="Active goals" value={active.length} />
        <StatCard
          label="Initiatives done"
          value={`${doneInits}/${initiatives.length}`}
        />
        <StatCard
          label="At risk / behind"
          value={goals.filter((g) => g.status === "at_risk" || g.status === "behind").length}
          muted={goals.every((g) => g.status === "on_track" || g.status === "done")}
        />
      </div>

      <div className="space-y-4">
        {goals.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            initiatives={initiatives.filter((i) => i.goal_id === g.id)}
          />
        ))}
        {goals.length === 0 && (
          <p className="text-sm text-gray-mid">
            No goals yet — add the 3–5 strategic goals for the year, then break each into
            initiatives you can check off.
          </p>
        )}
      </div>
    </div>
  );
}
