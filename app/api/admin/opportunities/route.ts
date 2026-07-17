import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { pushOpportunityToHubSpot } from "@/lib/hubspot/sync-out";
import { resolveConstituent } from "@/lib/fundraising/constituent-resolve";
import {
  loadPipelineConfig,
  stagesForPipeline,
  firstOpenStageKey,
} from "@/lib/fundraising/stages";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * POST /api/admin/opportunities — create a major-gift opportunity.
 *
 * Accepts either `constituent_id` (from a donor page) or a free-text
 * `constituent_name`, mirroring the grants funder_name UX: we match an
 * existing constituent case-insensitively (person full name or org name);
 * no match creates a new person constituent and says so in `warning`.
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = createServerSupabase();
  const resolved = await resolveConstituent(supabase, ctx.orgId, {
    constituentId: body.constituent_id,
    name: body.constituent_name,
  });
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const constituentId = resolved.constituentId;
  const warning = resolved.warning;

  // New asks open on the Sales pipeline; stage validity and the entry stage
  // come from per-org config (the stage column has no DB default anymore).
  const config = await loadPipelineConfig(supabase, ctx.orgId);
  const stages = stagesForPipeline(config, "default");

  const insert: Record<string, unknown> = {
    org_id: ctx.orgId,
    constituent_id: constituentId,
    pipeline: "default",
    stage:
      typeof body.stage === "string" && stages.some((s) => s.key === body.stage)
        ? body.stage
        : firstOpenStageKey(stages),
  };
  if (typeof body.name === "string" && body.name.trim()) insert.name = body.name.trim();
  if (typeof body.ask_amount === "number" && body.ask_amount >= 0)
    insert.ask_amount = Math.round(body.ask_amount * 100) / 100;
  if (isISODate(body.expected_close)) insert.expected_close = body.expected_close;
  if (typeof body.probability === "number" && body.probability >= 0 && body.probability <= 100)
    insert.probability = Math.round(body.probability);
  if (typeof body.capacity_rating === "number" && body.capacity_rating >= 1 && body.capacity_rating <= 5)
    insert.capacity_rating = Math.round(body.capacity_rating);
  if (typeof body.next_step === "string" && body.next_step.trim())
    insert.next_step = body.next_step.trim().slice(0, 500);
  if (isISODate(body.next_step_due)) insert.next_step_due = body.next_step_due;
  insert.owner = (await getAdminUser()) ?? null;

  const { data: opp, error } = await supabase
    .from("opportunities")
    .insert(insert)
    .select("id")
    .single();
  if (error || !opp) {
    console.error("Create opportunity failed:", error?.message);
    return NextResponse.json({ error: "Could not create opportunity" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.opportunity.create",
    entityType: "opportunity",
    entityId: opp.id,
    after: insert,
  });

  // Mirror to a connected HubSpot as a deal (no-op when standalone).
  await pushOpportunityToHubSpot(opp.id);

  return NextResponse.json({ id: opp.id, warning });
}
