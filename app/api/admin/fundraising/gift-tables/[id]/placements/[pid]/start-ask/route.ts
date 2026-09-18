import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { createOpportunity } from "@/lib/fundraising/create-opportunity";
import { pushOpportunityToHubSpot } from "@/lib/hubspot/sync-out";

/**
 * Start ask (specs/fundraising-gift-tables.md, Phase 4).
 *
 * Turns a placement into a real opportunity on the org's default pipeline and
 * links the two. From then on the placement's status FOLLOWS the stage and its
 * target displays the ask — one donor, one number, no second pipeline.
 *
 * It goes through lib/fundraising/create-opportunity.ts rather than
 * re-implementing the insert, so a gift table's ask is identical to one opened
 * anywhere else in Bloom, including the HubSpot mirror (Open decision 11).
 */

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; pid: string } },
) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const supabase = createServerSupabase();
  const { data: table } = await supabase
    .from("fr_gift_tables")
    .select("id, org_id, status, name, strategy_id")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!table) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });
  if (table.status !== "active" && table.status !== "draft") {
    return NextResponse.json({ error: "A closed table can't open new asks" }, { status: 409 });
  }

  const { data: placement } = await supabase
    .from("fr_gift_table_placements")
    .select("id, constituent_id, opportunity_id, target_amount, owner, next_step, next_step_due")
    .eq("id", params.pid)
    .eq("gift_table_id", table.id)
    .maybeSingle();
  if (!placement) return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  if (placement.opportunity_id) {
    return NextResponse.json(
      { error: "This placement already has an ask open." },
      { status: 409 },
    );
  }

  // Do not contact blocks Start ask for the same reason it blocks a new
  // placement: this is the step that means somebody makes contact.
  const { data: con } = await supabase
    .from("constituents")
    .select("id, do_not_contact")
    .eq("id", placement.constituent_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!con) return NextResponse.json({ error: "Constituent not found" }, { status: 404 });
  if (con.do_not_contact === true) {
    return NextResponse.json(
      { error: "This donor is marked do not contact, so an ask can't be opened." },
      { status: 409 },
    );
  }

  const askAmount =
    typeof body.ask_amount === "number"
      ? body.ask_amount
      : placement.target_amount === null
        ? null
        : Number(placement.target_amount);

  const created = await createOpportunity(supabase, ctx.orgId, {
    constituentId: placement.constituent_id as string,
    name: typeof body.name === "string" ? body.name : (table.name as string),
    askAmount,
    // Blank stays blank. Never fabricated.
    expectedClose: isISODate(body.expected_close) ? body.expected_close : null,
    nextStep:
      typeof body.next_step === "string" ? body.next_step : (placement.next_step as string | null),
    nextStepDue: isISODate(body.next_step_due)
      ? body.next_step_due
      : (placement.next_step_due as string | null),
    owner:
      typeof body.owner === "string" && body.owner.trim()
        ? body.owner.trim()
        : ((placement.owner as string | null) ?? (await getAdminUser()) ?? null),
    planStrategyId: (table.strategy_id as string | null) ?? null,
    pipeline: typeof body.pipeline === "string" ? body.pipeline : null,
  });
  if ("error" in created) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  const { error: linkErr } = await supabase
    .from("fr_gift_table_placements")
    .update({ opportunity_id: created.opportunityId })
    .eq("id", placement.id)
    .eq("gift_table_id", table.id);
  if (linkErr) {
    // The ask exists and is real; only the link failed. Say so rather than
    // implying nothing happened, and leave the opportunity in place.
    console.error("[start-ask] link failed:", linkErr.message);
    return NextResponse.json(
      {
        error:
          "The ask was created but could not be linked to this placement. Open it from the pipeline.",
        opportunity_id: created.opportunityId,
      },
      { status: 500 },
    );
  }

  // Both writes are audited: the ask, and the link that makes the placement
  // follow it.
  await audit(req, {
    action: "fundraising.opportunity.create",
    entityType: "opportunity",
    entityId: created.opportunityId,
    after: {
      constituent_id: placement.constituent_id,
      ask_amount: askAmount,
      pipeline: created.pipeline,
      stage: created.stage,
      plan_strategy_id: table.strategy_id ?? null,
      via: "gift_table_start_ask",
    },
  });
  await audit(req, {
    action: "fundraising.gift_table_placement.start_ask",
    entityType: "fr_gift_table_placement",
    entityId: placement.id as string,
    before: { opportunity_id: null },
    after: { opportunity_id: created.opportunityId },
  });

  // Mirror to a connected HubSpot, exactly as every other Bloom-created ask
  // does (no-op when standalone).
  await pushOpportunityToHubSpot(created.opportunityId);

  return NextResponse.json({ opportunity_id: created.opportunityId, stage: created.stage });
}
