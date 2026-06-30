/**
 * Global per-org AI spend backstop.
 *
 * The per-surface caps (Reed, funder research) limit one feature; this is the
 * ceiling ABOVE them, across every surface, to catch runaway spend a single
 * feature's cap can't see. It reads the unified ledger (lib/ai/ledger.ts).
 *
 * Two deliberate choices:
 * - Env-tunable, generous default. ORG_MONTHLY_AI_CAP_USD overrides the $100
 *   default, well above a small org's real month (the per-surface caps sum to
 *   ~$45), so it never bites normal use — it's a runaway backstop, not a budget.
 * - Fail-open. monthToDateSpendUsd returns 0 on any read error, so a metering
 *   hiccup can never block a legitimate call. A backstop must not become an
 *   outage.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { monthToDateSpendUsd } from "./ledger";

const DEFAULT_CAP_USD = 100;

/** The configured org-wide monthly ceiling, read fresh so env changes apply. */
export function orgMonthlyCapUsd(): number {
  const raw = Number(process.env.ORG_MONTHLY_AI_CAP_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CAP_USD;
}

export type OrgCapStatus = { over: boolean; spentUsd: number; capUsd: number };

/** Whether an org has crossed its global monthly AI backstop. Fail-open. */
export async function orgOverAICap(supabase: SupabaseClient, orgId: string): Promise<OrgCapStatus> {
  const capUsd = orgMonthlyCapUsd();
  const spentUsd = await monthToDateSpendUsd(supabase, orgId);
  return { over: spentUsd >= capUsd, spentUsd, capUsd };
}
