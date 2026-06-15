/**
 * The impure layer: reads the spine + data age + decision state, then hands
 * everything to the pure engine. Server-only. All queries fire in parallel;
 * the engine does the rest deterministically.
 */
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDataAge } from "../dataAge";
import { getFinanceSnapshot } from "../finance";
import {
  buildBriefing,
  type GatheredInputs,
  type ItemState,
  type Briefing,
} from "./engine";
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
}> {
  const sb = getSupabaseAdmin();

  const [dataAge, finance, tasksRes, complianceRes, opportunitiesRes, giftsRes, sessionsRes, attendanceRes, statesRes] =
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
    ]);

  const attended = new Set((attendanceRes.data ?? []).map((a) => a.session_id as string));
  const sessions: SessionLite[] = (sessionsRes.data ?? []).map((s) => ({
    id: s.id as string,
    session_date: s.session_date as string,
    hasAttendance: attended.has(s.id as string),
  }));

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
  };

  const states = new Map<string, ItemState>();
  for (const s of statesRes.data ?? []) states.set(s.item_id, s as ItemState);

  return { inputs, states, dataAge };
}

export async function gatherBriefing(now: number = Date.now()): Promise<Briefing> {
  const { inputs, states, dataAge } = await gatherInputs();
  return buildBriefing(inputs, dataAge, states, now);
}
