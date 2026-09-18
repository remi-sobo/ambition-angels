import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPipelineConfig, stagesForPipeline, firstOpenStageKey } from "@/lib/fundraising/stages";

/**
 * The one way BloomOS opens an ask (specs/fundraising-gift-tables.md,
 * Open decision 11).
 *
 * Before this, two routes created opportunities — POST /api/admin/opportunities
 * and the prospect promote route — and each carried its own copy of the same
 * three decisions: which pipeline, which stage, and whether to mirror the deal
 * into HubSpot. Start ask would have been a third copy, and a gift table
 * inventing its own HubSpot rule while HubSpot is being retired is exactly the
 * drift this spec exists to prevent. One path, one answer.
 *
 * What it settles:
 *
 *  - PIPELINE comes from `pipelines.is_default`. Both existing callers
 *    hardcoded "default", which happens to match every tenant today; the
 *    column has always existed and nothing read it. A tenant that renames its
 *    pipeline now works without a code change.
 *  - STAGE is the chosen pipeline's first OPEN stage, from the org's own
 *    config. Never a hardcoded key.
 *  - EXPECTED CLOSE is left null when the caller doesn't supply one. A
 *    fabricated close date is worse than none: it makes a forecast that
 *    nobody chose.
 *  - HUBSPOT mirroring is the CALLER's to do, immediately after, exactly as
 *    the existing routes do. It stays out here so this module can be imported
 *    without dragging the HubSpot client into every call site, and so the
 *    behaviour is visibly identical across all three.
 */

export type CreateOpportunityInput = {
  constituentId: string;
  /** Optional label; the UI falls back to the constituent's name. */
  name?: string | null;
  askAmount?: number | null;
  /** ISO date. Omitted or null means the ask has no expected close, and the
   *  column stays null rather than being invented. */
  expectedClose?: string | null;
  probability?: number | null;
  capacityRating?: number | null;
  nextStep?: string | null;
  nextStepDue?: string | null;
  owner?: string | null;
  /** Files the ask under a fundraising-plan strategy when one applies. */
  planStrategyId?: string | null;
  /** Override the default pipeline. Callers normally leave this alone. */
  pipeline?: string | null;
};

export type CreateOpportunityResult =
  | { opportunityId: string; pipeline: string; stage: string }
  | { error: string; status: number };

/** The org's default pipeline key, from `pipelines.is_default`. Falls back to
 *  "default" only when no pipeline is flagged — the same key the legacy
 *  config serves, so a pre-config org behaves exactly as it did. */
export async function defaultPipelineKey(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string> {
  const config = await loadPipelineConfig(supabase, orgId);
  const flagged = config.pipelines.find((p) => p.isDefault);
  return flagged?.key ?? "default";
}

export async function createOpportunity(
  supabase: SupabaseClient,
  orgId: string,
  input: CreateOpportunityInput,
): Promise<CreateOpportunityResult> {
  const pipeline = input.pipeline ?? (await defaultPipelineKey(supabase, orgId));
  const config = await loadPipelineConfig(supabase, orgId);
  const stages = stagesForPipeline(config, pipeline);
  const stage = firstOpenStageKey(stages);

  const insert: Record<string, unknown> = {
    org_id: orgId,
    constituent_id: input.constituentId,
    pipeline,
    stage,
  };
  if (input.name?.trim()) insert.name = input.name.trim().slice(0, 200);
  if (typeof input.askAmount === "number" && input.askAmount >= 0) {
    insert.ask_amount = Math.round(input.askAmount * 100) / 100;
  }
  // Only set when given. `expected_close` is nullable and stays that way.
  if (input.expectedClose) insert.expected_close = input.expectedClose;
  if (typeof input.probability === "number") {
    insert.probability = Math.max(0, Math.min(100, Math.round(input.probability)));
  }
  if (typeof input.capacityRating === "number") {
    insert.capacity_rating = Math.max(1, Math.min(5, Math.round(input.capacityRating)));
  }
  if (input.nextStep?.trim()) insert.next_step = input.nextStep.trim().slice(0, 500);
  if (input.nextStepDue) insert.next_step_due = input.nextStepDue;
  if (input.owner !== undefined) insert.owner = input.owner;
  if (input.planStrategyId) insert.plan_strategy_id = input.planStrategyId;

  const { data, error } = await supabase
    .from("opportunities")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) {
    console.error("[create-opportunity] insert failed:", error?.message);
    return { error: "Could not create the ask", status: 500 };
  }
  return { opportunityId: data.id as string, pipeline, stage };
}
