/**
 * The impure layer: reads the spine + data age + decision state, then hands
 * everything to the pure engine. Server-only. Six queries fire in parallel;
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
import type { TaskLite, ComplianceLite } from "./sources";

export async function gatherBriefing(now: number = Date.now()): Promise<Briefing> {
  const sb = getSupabaseAdmin();

  const [dataAge, finance, tasksRes, complianceRes, statesRes] = await Promise.all([
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
    // Resilient: if the state table isn't migrated yet, data is null → no
    // hidden items, and the read-only feed still works.
    sb.from("bloomos_briefing_state").select("item_id, decision, hidden_until"),
  ]);

  const gathered: GatheredInputs = {
    finance: { runwayMonths: finance.runwayMonths, cashOnHand: finance.cashOnHand },
    tasks: { tasks: (tasksRes.data ?? []) as TaskLite[] },
    compliance: { items: (complianceRes.data ?? []) as ComplianceLite[] },
  };

  const states = new Map<string, ItemState>();
  for (const s of statesRes.data ?? []) states.set(s.item_id, s as ItemState);

  return buildBriefing(gathered, dataAge, states, now);
}
