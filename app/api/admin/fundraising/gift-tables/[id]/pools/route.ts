import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { loadPipelineConfig, stagesForPipeline } from "@/lib/fundraising/stages";
import { constituentName } from "@/lib/fundraising/display";
import { pools, stageRoles, type Placement } from "@/lib/fundraising/gift-table";

/**
 * Candidate pools for a gift table (specs/fundraising-gift-tables.md,
 * Phase 3 · Candidate pools).
 *
 * Fetched on demand rather than with the page: the pools read across
 * constituents, opportunities, gifts, pledges, recurring plans and the bench,
 * and AA alone carries thousands of constituents. The spec's "Rollup cost"
 * failure mode is exactly this query, so it stays off the first paint and
 * behind the drawer that actually needs it.
 *
 * NOTHING here counts toward a level. A pool is a list of candidates; only a
 * placement is a name. That distinction is the whole reason the gap column
 * means anything.
 *
 * Deliberately does NOT read v_fr_rollups.next_step: that view's open-ask
 * filter is still V1 five-stage math (`stage not in ('steward','lost')`), so
 * under the ten-stage taxonomy it admits closed asks. Open work is read from
 * `opportunities` through the org's own stage config instead.
 */
export const dynamic = "force-dynamic";

const LIMIT = 2000;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const { data: table } = await supabase
    .from("fr_gift_tables")
    .select("id, starts_on, ends_on")
    .eq("id", params.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!table) return NextResponse.json({ error: "Gift table not found" }, { status: 404 });

  const window = { startsOn: table.starts_on as string, endsOn: table.ends_on as string };
  const today = new Date().toISOString().slice(0, 10);

  const [
    placementsRes,
    constituentsRes,
    oppsRes,
    giftsRes,
    pledgesRes,
    paymentsRes,
    recurringRes,
    benchRes,
    config,
  ] = await Promise.all([
    supabase
      .from("fr_gift_table_placements")
      .select("id, level_id, constituent_id, household_id, status, opportunity_id")
      .eq("gift_table_id", table.id)
      .eq("org_id", ctx.orgId),
    supabase
      .from("constituents")
      .select("id, type, first_name, last_name, org_name, household_id, do_not_contact")
      .eq("org_id", ctx.orgId)
      .is("archived_at", null)
      .limit(LIMIT),
    supabase
      .from("opportunities")
      .select("id, constituent_id, stage, ask_amount, expected_close")
      .eq("org_id", ctx.orgId)
      .limit(LIMIT),
    supabase
      .from("gifts")
      .select("constituent_id, amount, gift_date")
      .eq("org_id", ctx.orgId)
      .not("constituent_id", "is", null)
      .limit(10000),
    supabase
      .from("pledges")
      .select("id, constituent_id, total_amount, status")
      .eq("org_id", ctx.orgId)
      .eq("status", "active")
      .limit(LIMIT),
    supabase
      .from("pledge_payments")
      .select("pledge_id, due_date, status")
      .eq("org_id", ctx.orgId)
      .eq("status", "scheduled")
      .limit(LIMIT),
    supabase
      .from("recurring_plans")
      .select("id, constituent_id, amount, frequency, status")
      .eq("org_id", ctx.orgId)
      .eq("status", "active")
      .limit(LIMIT),
    supabase
      .from("fr_prospects")
      .select("id, name, constituent_id, status")
      .eq("org_id", ctx.orgId)
      .eq("status", "active")
      .limit(LIMIT),
    loadPipelineConfig(supabase, ctx.orgId),
  ]);

  const roles = stageRoles(
    stagesForPipeline(config, "default").map((s) => ({
      key: s.key,
      stageType: s.stageType,
      countsAsPledged: s.countsAsPledged,
    })),
  );

  // The soonest unpaid installment per pledge — what Collect reads and what
  // sorts the Pledged pool.
  const nextDue = new Map<string, string>();
  for (const p of (paymentsRes.data ?? []) as Array<{ pledge_id: string; due_date: string }>) {
    const prev = nextDue.get(p.pledge_id);
    if (!prev || p.due_date < prev) nextDue.set(p.pledge_id, p.due_date);
  }

  const constituents = ((constituentsRes.data ?? []) as unknown as Array<{
    id: string;
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
    household_id: string | null;
    do_not_contact: boolean;
  }>).map((c) => ({
    id: c.id,
    householdId: c.household_id,
    displayName: constituentName(c),
    doNotContact: c.do_not_contact === true,
  }));

  // Only the fields pools() reads. A pool never needs a placement's scores.
  const placements = ((placementsRes.data ?? []) as unknown as Array<{
    id: string;
    level_id: string;
    constituent_id: string;
    household_id: string | null;
    status: string;
    opportunity_id: string | null;
  }>)
    .filter((p) => p.status !== "removed")
    .map(
      (p) =>
        ({
          id: p.id,
          levelId: p.level_id,
          constituentId: p.constituent_id,
          householdId: p.household_id,
          displayName: "",
          targetAmount: null,
          cadence: null,
          termYears: null,
          capacityScore: null,
          affinityScore: null,
          connectionScore: null,
          readinessScore: null,
          warmPath: null,
          status: p.status as Placement["status"],
          nextStep: null,
          nextStepDue: null,
          owner: null,
          doNotContact: false,
          opportunity: p.opportunity_id
            ? {
                id: p.opportunity_id,
                stage: "",
                askAmount: null,
                expectedClose: null,
                nextStep: null,
                nextStepDue: null,
                owner: null,
              }
            : null,
        }) satisfies Placement,
    );

  const result = pools({
    today,
    window,
    placements,
    roles,
    constituents,
    opportunities: ((oppsRes.data ?? []) as unknown as Array<{
      id: string;
      constituent_id: string;
      stage: string;
      ask_amount: number | null;
      expected_close: string | null;
    }>).map((o) => ({
      id: o.id,
      constituentId: o.constituent_id,
      stage: o.stage,
      askAmount: o.ask_amount === null ? null : Number(o.ask_amount),
      expectedClose: o.expected_close,
    })),
    gifts: ((giftsRes.data ?? []) as unknown as Array<{
      constituent_id: string | null;
      amount: number;
      gift_date: string;
    }>).map((g) => ({
      constituentId: g.constituent_id,
      amount: Number(g.amount),
      giftDate: g.gift_date,
    })),
    pledges: ((pledgesRes.data ?? []) as unknown as Array<{
      id: string;
      constituent_id: string | null;
      total_amount: number;
      status: string;
    }>).map((p) => ({
      id: p.id,
      constituentId: p.constituent_id,
      totalAmount: Number(p.total_amount),
      status: p.status,
      unpaidDue: nextDue.get(p.id) ?? null,
    })),
    recurring: ((recurringRes.data ?? []) as unknown as Array<{
      id: string;
      constituent_id: string | null;
      amount: number;
      frequency: string | null;
      status: string;
    }>).map((r) => ({
      id: r.id,
      constituentId: r.constituent_id,
      amount: Number(r.amount),
      frequency: r.frequency,
      status: r.status,
    })),
    bench: ((benchRes.data ?? []) as unknown as Array<{
      id: string;
      name: string;
      constituent_id: string | null;
      status: string;
    }>).map((b) => ({
      id: b.id,
      name: b.name,
      constituentId: b.constituent_id,
      status: b.status,
    })),
  });

  // Each pool is capped for the drawer. The counts are the honest totals.
  const capped = Object.fromEntries(
    Object.entries(result).map(([key, rows]) => [
      key,
      { total: rows.length, rows: rows.slice(0, 50) },
    ]),
  );
  return NextResponse.json({ pools: capped });
}
