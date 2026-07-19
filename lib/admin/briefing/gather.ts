/**
 * The impure layer: reads the spine + data age + decision state, then hands
 * everything to the pure engine. Server-only. All queries fire in parallel;
 * the engine does the rest deterministically.
 */
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { getDataAge } from "../dataAge";
import { getFinanceSnapshot } from "../finance";
import { deriveHealth, isOffTrack } from "../plan/health";
import {
  buildBriefing,
  type GatheredInputs,
  type ItemState,
  type Briefing,
} from "./engine";
import { buildPulse, type Pulse } from "./pulse";
import { getFundraisingPriorities, type FundraisingMove } from "./fundraising";
import { getOrgContext } from "@/lib/admin/auth";
import { getResidentOrgId } from "@/lib/admin/orgs";
import { meetingFollowUpGaps } from "@/lib/meetings/coverage";
import type { FinanceSnapshot } from "../finance";
import type {
  TaskLite,
  ComplianceLite,
  OpportunityLite,
  PendingGiftLite,
  SessionLite,
  FollowupLite,
} from "./sources";

export async function gatherInputs(): Promise<{
  inputs: GatheredInputs;
  states: Map<string, ItemState>;
  dataAge: Awaited<ReturnType<typeof getDataAge>>;
  finance: FinanceSnapshot;
}> {
  const sb = getSupabaseAdmin();
  // Org fence: the service-role client bypasses RLS, so every read below is
  // scoped to one org. The briefing runs in sessionless contexts too (cron,
  // narrative pre-warm), so fall back to the resident org like the finance
  // snapshot does.
  const orgId = (await getOrgContext().catch(() => null))?.orgId ?? (await getResidentOrgId());

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
    followupsRes,
  ] =
    await Promise.all([
      getDataAge(),
      getFinanceSnapshot(),
      sb
        .from("ops_tasks")
        .select("id, title, due_date, status")
        .eq("org_id", orgId)
        .neq("status", "done")
        .not("due_date", "is", null)
        .order("due_date", { ascending: true })
        .limit(200),
      sb
        .from("compliance_items")
        .select("id, title, due_date, status, jurisdiction")
        .eq("org_id", orgId)
        .in("status", ["upcoming", "in_progress"])
        .order("due_date", { ascending: true })
        .limit(200),
      sb
        .from("opportunities")
        .select("id, name, ask_amount, next_step, next_step_due, stage")
        .eq("org_id", orgId)
        .not("stage", "ilike", "%closed%")
        .or(EXCLUDE_PARTNERSHIP_OPPS)
        .limit(300),
      sb
        .from("gifts")
        .select("id, amount, gift_date")
        .eq("org_id", orgId)
        .eq("acknowledgment_status", "pending")
        .limit(300),
      sb.from("cohort_sessions").select("id, session_date").eq("org_id", orgId).limit(300),
      sb.from("attendance").select("session_id").eq("org_id", orgId).limit(2000),
      // Resilient: if the state table isn't migrated yet, data is null → no
      // hidden items, and the feed still works. Keyed by (org_id, item_id).
      sb.from("bloomos_briefing_state").select("item_id, decision, hidden_until").eq("org_id", orgId),
      // Strategy rollup (Phase 4): objective health + the OGSM review nudge.
      // Resilient if unseeded / plan_reviews not yet migrated (data → null).
      sb.from("plan_objectives").select("id, title, status, status_override").eq("org_id", orgId),
      sb.from("plan_goals").select("id, objective_id").eq("org_id", orgId),
      sb.from("plan_kpis").select("goal_id, objective_id, status").eq("org_id", orgId),
      sb.from("plan_reviews").select("next_review_at").eq("org_id", orgId).order("conducted_at", { ascending: false }).limit(1),
      // Email follow-ups (Cowork/Gmail): open tasks labelled "follow-up", oldest
      // first. Resilient if the label/pipeline isn't active yet (data → []).
      sb
        .from("ops_tasks")
        .select("id, title, description, created_at, due_date, status")
        .eq("org_id", orgId)
        .contains("labels", ["follow-up"])
        .neq("status", "done")
        .is("archived_at", null)
        .order("created_at", { ascending: true })
        .limit(50),
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
  for (const o of (objectivesRes.data ?? []) as { id: string; title: string; status: string; status_override: string | null }[]) {
    // Effective health: a reasoned override wins, else the worst measure (B2-1).
    const health = o.status_override ?? deriveHealth(statusesByObjective.get(o.id) ?? []);
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
    followups: { followups: (followupsRes.data ?? []) as FollowupLite[] },
  };

  // Meeting follow-up coverage (deterministic). Org-scoped; resilient if there's
  // no session (narrative pre-warm / cron) or no meetings yet → source skipped.
  const ctx = await getOrgContext().catch(() => null);
  if (ctx) {
    const coverage = await meetingFollowUpGaps(sb, ctx.orgId, new Date()).catch(() => null);
    if (coverage) {
      inputs.meetings = {
        gapCount: coverage.gapCount,
        total: coverage.total,
        windowDays: coverage.windowDays,
      };
    }
  }

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
export async function gatherBriefingView(now: number = Date.now()): Promise<{
  briefing: Briefing;
  pulse: Pulse;
  followups: FollowupLite[];
  fundraising: FundraisingMove[];
}> {
  const { inputs, states, dataAge, finance } = await gatherInputs();
  const briefing = buildBriefing(inputs, dataAge, states, now);
  const pulse = buildPulse(finance, inputs.majorGifts.opportunities);
  const fundraising = await getFundraisingPriorities(getSupabaseAdmin(), now).catch(() => []);
  return { briefing, pulse, followups: inputs.followups?.followups ?? [], fundraising };
}
