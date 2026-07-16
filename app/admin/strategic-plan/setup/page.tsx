import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "../../_components/PageHeader";
import SetupWizard, {
  type WizObjective,
  type WizGoal,
  type WizKpi,
  type WizInitiative,
} from "./_components/SetupWizard";

// Setup / refresh wizard (BloomOS Strategy, Phase 5). Helps a tenant turn loose
// intentions into a measurable plan: it shapes and measures, it never authors
// strategy and never gates direct creation. Deterministic — no AI writes
// objectives or mission (a stated non-goal in the spec). An org whose plan was
// already seeded can skip this; it's for a brand-new org landing on an empty plan.
export const dynamic = "force-dynamic";

export default async function StrategySetupPage() {
  const ctx = await getOrgContext();
  if (!ctx) return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;
  const orgId = ctx.orgId;
  const sb = getSupabaseAdmin();

  const [foundationRes, objsRes, goalsRes, kpisRes, initsRes, reviewRes] = await Promise.all([
    sb.from("plan_foundation").select("mission, vision, values, behaviors").eq("org_id", orgId).maybeSingle(),
    sb.from("plan_objectives").select("id, title").eq("org_id", orgId).order("sort_order").order("created_at"),
    sb.from("plan_goals").select("id, title, objective_id").eq("org_id", orgId).order("sort_order").order("created_at"),
    sb.from("plan_kpis").select("id, goal_id, objective_id, source, metric_key").eq("org_id", orgId),
    sb.from("plan_initiatives").select("id, goal_id").eq("org_id", orgId),
    sb.from("plan_reviews").select("next_review_at").eq("org_id", orgId).order("conducted_at", { ascending: false }).limit(1),
  ]);

  const f = foundationRes.data as { mission: string | null; vision: string | null; values: unknown; behaviors: unknown } | null;
  const foundationSet = !!(f && (f.mission || f.vision || (Array.isArray(f.values) && f.values.length > 0)));
  const objectives = (objsRes.data ?? []) as WizObjective[];
  const goals = (goalsRes.data ?? []) as WizGoal[];
  const kpis = (kpisRes.data ?? []) as WizKpi[];
  const initiatives = (initsRes.data ?? []) as WizInitiative[];
  const nextReviewAt = ((reviewRes.data ?? [])[0] as { next_review_at: string | null } | undefined)?.next_review_at ?? null;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[900px]">
      <PageHeader
        title="Plan setup"
        subtitle={
          <>
            Close the gaps that make a plan measurable — add measures, wire them to live data, set a review
            cadence · jump to the <Link href="/admin/strategic-plan" className="text-orange hover:underline">full plan</Link> anytime
          </>
        }
      />
      <SetupWizard
        foundationSet={foundationSet}
        objectives={objectives}
        goals={goals}
        kpis={kpis}
        initiatives={initiatives}
        nextReviewAt={nextReviewAt}
      />
    </div>
  );
}
