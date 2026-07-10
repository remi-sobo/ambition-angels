// No "server-only" marker: this module sits in the PLAN_METRICS import chain
// that unit tests exercise (like lib/admin/finance.ts). Everything here is
// still server-side in practice — the loaders need a Supabase client.
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Participant stages — the journey vocabulary as per-org DATA (program spine,
 * spec #4). The participant_stages table is the source of truth; the
 * constants below are the starter template (seeded per org by the migration
 * and at provisioning) and the fallback if an org somehow has no rows, so
 * the roster can never render empty-headed.
 */

export type ParticipantStage = {
  stage_key: string;
  label: string;
  sort_order: number;
  engaged: boolean;
  terminal: boolean;
};

/** Starter template + fallback. Mirrors the migration seed. */
export const DEFAULT_STAGES: ParticipantStage[] = [
  { stage_key: "discover", label: "Discover", sort_order: 1, engaged: false, terminal: false },
  { stage_key: "learn", label: "Learn", sort_order: 2, engaged: true, terminal: false },
  { stage_key: "practice", label: "Practice", sort_order: 3, engaged: true, terminal: false },
  { stage_key: "connect", label: "Connect", sort_order: 4, engaged: true, terminal: false },
  { stage_key: "launch", label: "Launch", sort_order: 5, engaged: true, terminal: false },
  { stage_key: "alumni", label: "Alumni", sort_order: 6, engaged: false, terminal: true },
  { stage_key: "withdrawn", label: "Withdrawn", sort_order: 7, engaged: false, terminal: true },
];

/** The org's stage vocabulary, session-scoped (program.read RLS). */
export const getParticipantStages = cache(async (): Promise<ParticipantStage[]> => {
  const ctx = await getOrgContext();
  if (!ctx) return DEFAULT_STAGES;
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("participant_stages")
    .select("stage_key, label, sort_order, engaged, terminal")
    .eq("org_id", ctx.orgId)
    .order("sort_order");
  const rows = (data ?? []) as ParticipantStage[];
  return rows.length > 0 ? rows : DEFAULT_STAGES;
});

/**
 * Engaged stage keys for one org — the "active participant" definition the
 * catalog's resolver counts against. Any client (service role for the cron,
 * session for pages); falls back to the template's engaged set.
 */
export async function getEngagedStageKeys(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("participant_stages")
    .select("stage_key")
    .eq("org_id", orgId)
    .eq("engaged", true);
  const keys = ((data ?? []) as { stage_key: string }[]).map((r) => r.stage_key);
  return keys.length > 0 ? keys : DEFAULT_STAGES.filter((s) => s.engaged).map((s) => s.stage_key);
}
