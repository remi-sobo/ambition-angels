import type { SupabaseClient } from "@supabase/supabase-js";
import { constituentName } from "@/lib/fundraising/display";
import { loadPipelineConfig, stagesForPipeline } from "@/lib/fundraising/stages";
import {
  creditedValue,
  gaps,
  pools,
  placementState,
  placementTarget,
  slotNames,
  stageRoles,
  tableGoal,
  tableShape,
  valueContext,
  type Gaps,
  type GiftLevel,
  type GiftTable,
  type LevelSlot,
  type Placement,
  type PlacementState,
  type PoolCandidate,
  type PoolKey,
  type StageConfigRow,
  type StageRole,
} from "@/lib/fundraising/gift-table";

/**
 * The gift-table spine, read once (specs/fundraising-gift-tables.md, Phase 5).
 *
 * Phase 5 adds two more readers of the same numbers — the close snapshot and
 * the workbook export — and that is precisely where a gift table goes wrong.
 * The workbooks this feature replaced drifted from reality because each one
 * stored its own answers; an export route that re-implemented the credit rules
 * would reproduce that bug inside Bloom, with the added cruelty of looking
 * official.
 *
 * So the detail page, the close action and the export all derive from HERE.
 * Nothing downstream computes a level's credited value, its gap, or the
 * table's goal on its own. When a rule changes, it changes once.
 */

export type GiftTableRow = GiftTable & {
  targetRationale: string | null;
  multiplierRationale: string | null;
  notes: string | null;
  campaignId: string | null;
  closedAt: string | null;
  closedSnapshot: unknown;
};

export type GiftTableSpine = {
  table: GiftTableRow;
  levels: GiftLevel[];
  placements: Placement[];
  credits: Array<{ sourceType: "gift" | "pledge" | "recurring_plan" | "grant"; sourceId: string }>;
  roles: Record<string, StageRole>;
  stages: StageConfigRow[];
  goal: number;
  shape: number;
  slots: LevelSlot[];
  gaps: Gaps;
};

const TABLE_COLUMNS =
  "id, name, starts_on, ends_on, status, target, multiplier, goal_round_to, coverage_basis, " +
  "default_term_years, monthly_modeled_years, target_rationale, multiplier_rationale, " +
  "notes, campaign_id, closed_at, closed_snapshot";

const LEVEL_COLUMNS =
  "id, label, amount, cadence, term_years, gifts_needed, prospects_per_gift, purpose, sort";

const PLACEMENT_COLUMNS =
  "id, level_id, constituent_id, household_id, target_amount, cadence, term_years, " +
  "capacity_score, affinity_score, connection_score, readiness_score, warm_path, " +
  "why_note, status, next_step, next_step_due, owner, " +
  "constituent:constituents ( id, type, first_name, last_name, org_name, do_not_contact, household_id ), " +
  "opportunity:opportunities ( id, stage, ask_amount, expected_close, next_step, next_step_due, owner )";

type RawPlacement = {
  id: string;
  level_id: string;
  constituent_id: string;
  household_id: string | null;
  target_amount: number | string | null;
  cadence: Placement["cadence"];
  term_years: number | null;
  capacity_score: number | null;
  affinity_score: number | null;
  connection_score: number | null;
  readiness_score: number | null;
  warm_path: string | null;
  why_note: string | null;
  status: Placement["status"];
  next_step: string | null;
  next_step_due: string | null;
  owner: string | null;
  constituent: {
    id: string;
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
    do_not_contact: boolean;
    household_id: string | null;
  } | null;
  opportunity: {
    id: string;
    stage: string;
    ask_amount: number | string | null;
    expected_close: string | null;
    next_step: string | null;
    next_step_due: string | null;
    owner: string | null;
  } | null;
};

/**
 * Load one gift table and everything the level math needs.
 *
 * Returns null when the table does not exist FOR THIS ORG — the org filter is
 * on every query rather than trusted to RLS alone, so a bug in a policy
 * cannot turn into a cross-tenant read.
 */
export async function loadGiftTableSpine(
  supabase: SupabaseClient,
  orgId: string,
  tableId: string,
): Promise<GiftTableSpine | null> {
  // Concatenated select strings defeat PostgREST's type inference, so the
  // result sets are cast — the same shape the other fundraising pages use.
  const [{ data: rawRow }, { data: rawLevels }, { data: rawPlacements }, { data: rawCredits }, pipelineConfig] =
    await Promise.all([
      supabase
        .from("fr_gift_tables")
        .select(TABLE_COLUMNS)
        .eq("id", tableId)
        .eq("org_id", orgId)
        .maybeSingle(),
      supabase
        .from("fr_gift_table_levels")
        .select(LEVEL_COLUMNS)
        .eq("gift_table_id", tableId)
        .eq("org_id", orgId)
        .order("sort"),
      supabase
        .from("fr_gift_table_placements")
        .select(PLACEMENT_COLUMNS)
        .eq("gift_table_id", tableId)
        .eq("org_id", orgId),
      supabase
        .from("fr_gift_table_credits")
        .select("id, source_type, source_id")
        .eq("gift_table_id", tableId)
        .eq("org_id", orgId),
      loadPipelineConfig(supabase, orgId),
    ]);

  const row = rawRow as unknown as Record<string, unknown> | null;
  if (!row) return null;

  const table: GiftTableRow = {
    id: row.id as string,
    name: row.name as string,
    startsOn: row.starts_on as string,
    endsOn: row.ends_on as string,
    status: row.status as GiftTable["status"],
    target: Number(row.target ?? 0),
    multiplier: Number(row.multiplier ?? 1),
    goalRoundTo: row.goal_round_to === null ? null : Number(row.goal_round_to),
    coverageBasis: row.coverage_basis as GiftTable["coverageBasis"],
    defaultTermYears: Number(row.default_term_years ?? 1),
    monthlyModeledYears: Number(row.monthly_modeled_years ?? 1),
    targetRationale: (row.target_rationale as string | null) ?? null,
    multiplierRationale: (row.multiplier_rationale as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    campaignId: (row.campaign_id as string | null) ?? null,
    closedAt: (row.closed_at as string | null) ?? null,
    closedSnapshot: row.closed_snapshot ?? null,
  };

  const levels: GiftLevel[] = ((rawLevels ?? []) as unknown as Record<string, unknown>[]).map((l) => ({
    id: l.id as string,
    label: l.label as string,
    amount: Number(l.amount),
    cadence: l.cadence as GiftLevel["cadence"],
    termYears: l.term_years === null ? null : Number(l.term_years),
    giftsNeeded: Number(l.gifts_needed),
    prospectsPerGift: Number(l.prospects_per_gift),
    purpose: (l.purpose as string | null) ?? null,
    sort: Number(l.sort),
  }));

  // A household takes one slot, so it should read as one name: the household
  // salutation wins over the person's own.
  const rows = (rawPlacements ?? []) as unknown as RawPlacement[];
  const householdIds = Array.from(
    new Set(rows.map((p) => p.household_id).filter((h): h is string => !!h)),
  );
  const { data: householdRows } = householdIds.length
    ? await supabase
        .from("households")
        .select("id, name, salutation")
        .eq("org_id", orgId)
        .in("id", householdIds)
    : { data: [] as Array<{ id: string; name: string; salutation: string | null }> };
  const householdName = new Map(
    ((householdRows ?? []) as Array<{ id: string; name: string; salutation: string | null }>).map(
      (h) => [h.id, (h.salutation || h.name) ?? ""],
    ),
  );

  const placements: Placement[] = rows.map((p) => ({
    id: p.id,
    levelId: p.level_id,
    constituentId: p.constituent_id,
    householdId: p.household_id,
    displayName:
      (p.household_id && householdName.get(p.household_id)) ||
      (p.constituent ? constituentName(p.constituent) : "Unnamed"),
    targetAmount: p.target_amount === null ? null : Number(p.target_amount),
    cadence: p.cadence,
    termYears: p.term_years === null ? null : Number(p.term_years),
    capacityScore: p.capacity_score,
    affinityScore: p.affinity_score,
    connectionScore: p.connection_score,
    readinessScore: p.readiness_score,
    warmPath: p.warm_path,
    status: p.status,
    nextStep: p.next_step,
    nextStepDue: p.next_step_due,
    owner: p.owner,
    doNotContact: p.constituent?.do_not_contact === true,
    opportunity: p.opportunity
      ? {
          id: p.opportunity.id,
          stage: p.opportunity.stage,
          askAmount: p.opportunity.ask_amount === null ? null : Number(p.opportunity.ask_amount),
          expectedClose: p.opportunity.expected_close,
          nextStep: p.opportunity.next_step,
          nextStepDue: p.opportunity.next_step_due,
          owner: p.opportunity.owner,
        }
      : null,
  }));

  const stages = stagesForPipeline(pipelineConfig, "default").map((s) => ({
    key: s.key,
    stageType: s.stageType,
    countsAsPledged: s.countsAsPledged,
  }));
  const roles = stageRoles(stages);

  const credits = ((rawCredits ?? []) as unknown as Array<{
    source_type: GiftTableSpine["credits"][number]["sourceType"];
    source_id: string;
  }>).map((c) => ({ sourceType: c.source_type, sourceId: c.source_id }));

  const slots = slotNames(levels, placements, table, roles);

  return {
    table,
    levels,
    placements,
    credits,
    roles,
    stages,
    goal: tableGoal(table),
    shape: tableShape(levels, table),
    slots,
    gaps: gaps(slots),
  };
}

/** The placement view the export and the drawer both render a name from. */
export type PlacedName = {
  placement: Placement;
  state: PlacementState;
  levelLabel: string;
  levelValue: number;
  /** What this name is being worked for, on the table's basis. */
  worth: number;
};

/**
 * Placed names in level order. The filter is `placementState`, not the raw
 * status column: once a placement is linked to an opportunity its state is
 * DERIVED from that ask's stage, so reading `status` directly would list a
 * name the level drawer has already dropped. Removed names are excluded;
 * declined ones are kept and labelled, because "we asked and they said no"
 * is the most useful row on next year's table.
 */
export function placedNames(spine: GiftTableSpine): PlacedName[] {
  const byLevel = new Map(spine.slots.map((s) => [s.level.id, s]));
  const ctx = valueContext(spine.table);
  const out: PlacedName[] = [];
  for (const slot of spine.slots) {
    for (const p of spine.placements) {
      if (p.levelId !== slot.level.id) continue;
      const state = placementState(p, spine.roles);
      if (state === "removed") continue;
      const level = byLevel.get(p.levelId)!.level;
      out.push({
        placement: p,
        state,
        levelLabel: slot.level.label,
        levelValue: slot.value,
        worth: creditedValue(
          {
            amount: placementTarget(p) ?? level.amount,
            cadence: p.cadence ?? level.cadence,
            termYears: p.termYears ?? level.termYears,
          },
          ctx,
        ),
      });
    }
  }
  return out;
}

// ── Candidate pools ─────────────────────────────────────────────────────────

const POOL_LIMIT = 2000;

/**
 * Candidate pools for a gift table (Phase 3 · Candidate pools, shared in
 * Phase 5).
 *
 * Lifted out of the pools route verbatim so the level drawer and the exported
 * workbook list the SAME candidates. A workbook that disagreed with the screen
 * it was exported from would be worse than no workbook at all.
 *
 * NOTHING here counts toward a level. A pool is a list of candidates; only a
 * placement is a name. That distinction is the whole reason the gap column
 * means anything.
 *
 * Deliberately does NOT read v_fr_rollups.next_step: that view's open-ask
 * filter is still V1 five-stage math, so under the ten-stage taxonomy it
 * admits closed asks. Open work is read from `opportunities` through the org's
 * own stage config instead.
 *
 * This reads across constituents, opportunities, gifts, pledges, recurring
 * plans and the bench, so it stays OFF the first paint — the drawer fetches it
 * on open, and the export pays for it once.
 */
export async function loadPools(
  supabase: SupabaseClient,
  orgId: string,
  tableId: string,
  window: { startsOn: string; endsOn: string },
  today: string,
): Promise<Record<PoolKey, PoolCandidate[]>> {
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
      .eq("gift_table_id", tableId)
      .eq("org_id", orgId),
    supabase
      .from("constituents")
      .select("id, type, first_name, last_name, org_name, household_id, do_not_contact")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .limit(POOL_LIMIT),
    supabase
      .from("opportunities")
      .select("id, constituent_id, stage, ask_amount, expected_close")
      .eq("org_id", orgId)
      .limit(POOL_LIMIT),
    supabase
      .from("gifts")
      .select("constituent_id, amount, gift_date")
      .eq("org_id", orgId)
      .not("constituent_id", "is", null)
      .limit(10000),
    supabase
      .from("pledges")
      .select("id, constituent_id, total_amount, status")
      .eq("org_id", orgId)
      .eq("status", "active")
      .limit(POOL_LIMIT),
    supabase
      .from("pledge_payments")
      .select("pledge_id, due_date, status")
      .eq("org_id", orgId)
      .eq("status", "scheduled")
      .limit(POOL_LIMIT),
    supabase
      .from("recurring_plans")
      .select("id, constituent_id, amount, frequency, status")
      .eq("org_id", orgId)
      .eq("status", "active")
      .limit(POOL_LIMIT),
    supabase
      .from("fr_prospects")
      .select("id, name, constituent_id, status")
      .eq("org_id", orgId)
      .eq("status", "active")
      .limit(POOL_LIMIT),
    loadPipelineConfig(supabase, orgId),
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

  return pools({
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


}
