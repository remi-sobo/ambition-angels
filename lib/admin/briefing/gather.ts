/**
 * The impure layer: reads the spine + data age + decision state, then hands
 * everything to the pure engine. Server-only. All queries fire in parallel;
 * the engine does the rest deterministically.
 */
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDataAge } from "../dataAge";
import { getFinanceSnapshot } from "../finance";
import { deriveHealth, worstHealth, isOffTrack } from "../plan/health";
import {
  buildBriefing,
  type GatheredInputs,
  type ItemState,
  type Briefing,
} from "./engine";
import { buildPulse, type Pulse } from "./pulse";
import type { FinanceSnapshot } from "../finance";
import type {
  TaskLite,
  ComplianceLite,
  OpportunityLite,
  PendingGiftLite,
  SessionLite,
} from "./sources";

export async function gatherInputs(): Promise<{
  inputs: GatheredInputs;
  states: Map<string, ItemState>;
  dataAge: Awaited<ReturnType<typeof getDataAge>>;
  finance: FinanceSnapshot;
}> {
  const sb = getSupabaseAdmin();

  const [
    dataAge,
    finance,
    tasksRes,
    complianceRes,
    opportunitiesRes,
    giftsRes,
    sessionsRes,
    attendanceRes,
    statesRes,
    objectivesRes,
    planGoalsRes,
    planKpisRes,
    reviewsRes,
  ] =
    await Promise.all([
      getDataAge(),
      getFinanceSnapshot(),
      sb
        .from("ops_tasks")
        .select("id, title, due_date, status")
        .neq("status", "done")
        .not("due_date", "is", null)
        .order("due_date", { ascending: true })
        .limit(200),
      sb
        .from("compliance_items")
        .select("id, title, due_date, status, jurisdiction")
        .in("status", ["upcoming", "in_progress"])
        .order("due_date", { ascending: true })
        .limit(200),
      sb
        .from("opportunities")
        .select("id, name, ask_amount, next_step, next_step_due, stage")
        .not("stage", "ilike", "%closed%")
        .limit(300),
      sb
        .from("gifts")
        .select("id, amount, gift_date")
        .eq("acknowledgment_status", "pending")
        .limit(300),
      sb.from("cohort_sessions").select("id, session_date").limit(300),
      sb.from("attendance").select("session_id").limit(2000),
      // Resilient: if the state table isn't migrated yet, data is null → no
      // hidden items, and the feed still works.
      sb.from("bloomos_briefing_state").select("item_id, decision, hidden_until"),
      // Strategy rollup (Phase 4): objective health + the OGSM review nudge.
      // Resilient if unseeded / plan_reviews not yet migrated (data → null).
      sb.from("plan_objectives").select("id, title, status"),
      sb.from("plan_goals").select("id, objective_id"),
      sb.from("plan_kpis").select("goal_id, objective_id, status"),
      sb.from("plan_reviews").select("next_review_at").order("conducted_at", { ascending: false }).limit(1),
    ]);

  const attended = new Set((attendanceRes.data ?? []).map((a) => a.session_id as string));
  const sessions: SessionLite[] = (sessionsRes.data ?? []).map((s) => ({
    id: s.id as string,
    session_date: s.session_date as string,
    hasAttendance: attended.has(s.id as string),
  }));

  // ── Strategy rollup: each objective's health from its KPIs (+ its manual
  // status), and how many days until the next OGSM review. ──────────────────
  const goalObjective = new Map(
    ((planGoalsRes.data ?? []) as { id: string; objective_id: string | null }[]).map((g) => [
      g.id,
      g.objective_id,
    ])
  );
  const statusesByObjective = new Map<string, string[]>();
  for (const k of (planKpisRes.data ?? []) as {
    goal_id: string | null;
    objective_id: string | null;
    status: string;
  }[]) {
    const objId = k.objective_id ?? (k.goal_id ? goalObjective.get(k.goal_id) ?? null : null);
    if (!objId) continue;
    const arr = statusesByObjective.get(objId) ?? [];
    arr.push(k.status);
    statusesByObjective.set(objId, arr);
  }
  const objectivesOffTrack: { title: string; health: string }[] = [];
  for (const o of (objectivesRes.data ?? []) as { id: string; title: string; status: string }[]) {
    const health = worstHealth(deriveHealth(statusesByObjective.get(o.id) ?? []), o.status);
    if (isOffTrack(health)) objectivesOffTrack.push({ title: o.title, health: health! });
  }
  const nextReviewAt = ((reviewsRes.data ?? [])[0] as { next_review_at: string | null } | undefined)
    ?.next_review_at;
  const reviewDueDays = nextReviewAt
    ? Math.floor((Date.parse(`${nextReviewAt}T00:00:00Z`) - Date.now()) / 86_400_000)
    : null;

  const inputs: GatheredInputs = {
    finance: { runwayMonths: finance.runwayMonths, cashOnHand: finance.cashOnHand },
    tasks: { tasks: (tasksRes.data ?? []) as TaskLite[] },
    compliance: { items: (complianceRes.data ?? []) as ComplianceLite[] },
    majorGifts: {
      opportunities: (opportunitiesRes.data ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        ask_amount: o.ask_amount == null ? null : Number(o.ask_amount),
        next_step: o.next_step,
        next_step_due: o.next_step_due,
      })) as OpportunityLite[],
    },
    donors: {
      pendingGifts: (giftsRes.data ?? []).map((g) => ({
        id: g.id,
        amount: Number(g.amount),
        gift_date: g.gift_date,
      })) as PendingGiftLite[],
    },
    engagement: { sessions },
    strategy: { objectivesOffTrack, reviewDueDays },
  };

  const states = new Map<string, ItemState>();
  for (const s of statesRes.data ?? []) states.set(s.item_id, s as ItemState);

  return { inputs, states, dataAge, finance };
}

export async function gatherBriefing(now: number = Date.now()): Promise<Briefing> {
  const { inputs, states, dataAge } = await gatherInputs();
  return buildBriefing(inputs, dataAge, states, now);
}

/** The page view: the ranked briefing plus the deterministic pulse strip,
 *  from a single spine gather. Shared by the page render and the narrative
 *  pre-warm so both see identical numbers. */
export async function gatherBriefingView(
  now: number = Date.now()
): Promise<{ briefing: Briefing; pulse: Pulse }> {
  const { inputs, states, dataAge, finance } = await gatherInputs();
  const briefing = buildBriefing(inputs, dataAge, states, now);
  const pulse = buildPulse(finance, inputs.majorGifts.opportunities);
  return { briefing, pulse };
}
