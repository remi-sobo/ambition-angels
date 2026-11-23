import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeatureKey } from "@/lib/admin/entitlements";

/**
 * Per-org opt-in for the scheduled jobs that EMAIL people (pre-SafeSpace
 * item 10): `daily-reminders`, `weekly-digest` and `meet-reminders` send
 * only for orgs holding `notify.operator_emails`. Every other org is skipped
 * before anything is read for it, so turning a job's schedule on never starts
 * mailing a tenant that has not chosen it.
 *
 * Service-role read: crons have no session. The query returns org ids only.
 * A failed read fails CLOSED (the caller sends nothing and reports the error).
 */
export const OPERATOR_EMAIL_OPT_IN: FeatureKey = "notify.operator_emails";

export type OptInResult = { ok: true; orgIds: ReadonlySet<string> } | { ok: false; error: string };

export async function loadOperatorEmailOrgs(supabase: SupabaseClient): Promise<OptInResult> {
  const { data, error } = await supabase
    .from("org_entitlements")
    .select("org_id")
    .eq("feature_key", OPERATOR_EMAIL_OPT_IN)
    .eq("enabled", true);
  if (error) return { ok: false, error: `org_entitlements: ${error.message}` };
  return { ok: true, orgIds: new Set((data ?? []).map((r) => r.org_id as string)) };
}

export const NOT_OPTED_IN = `not opted in (${OPERATOR_EMAIL_OPT_IN})`;
