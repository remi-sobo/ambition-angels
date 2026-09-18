import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { pushOpportunityToHubSpot } from "@/lib/hubspot/sync-out";
import { resolveConstituent } from "@/lib/fundraising/constituent-resolve";
import { createOpportunity } from "@/lib/fundraising/create-opportunity";

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

  // One shared create path for every Bloom-opened ask: pipeline from
  // pipelines.is_default, stage from that pipeline's first open stage, and a
  // blank expected close left blank (lib/fundraising/create-opportunity.ts).
  const created = await createOpportunity(supabase, ctx.orgId, {
    constituentId,
    name: typeof body.name === "string" ? body.name : null,
    askAmount: typeof body.ask_amount === "number" ? body.ask_amount : null,
    expectedClose: isISODate(body.expected_close) ? body.expected_close : null,
    probability: typeof body.probability === "number" ? body.probability : null,
    capacityRating: typeof body.capacity_rating === "number" ? body.capacity_rating : null,
    nextStep: typeof body.next_step === "string" ? body.next_step : null,
    nextStepDue: isISODate(body.next_step_due) ? body.next_step_due : null,
    owner: (await getAdminUser()) ?? null,
  });
  if ("error" in created) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  await audit(req, {
    action: "fundraising.opportunity.create",
    entityType: "opportunity",
    entityId: created.opportunityId,
    after: {
      constituent_id: constituentId,
      pipeline: created.pipeline,
      stage: created.stage,
      ask_amount: body.ask_amount ?? null,
    },
  });

  // Mirror to a connected HubSpot as a deal (no-op when standalone).
  await pushOpportunityToHubSpot(created.opportunityId);

  return NextResponse.json({ id: created.opportunityId, warning });
}
