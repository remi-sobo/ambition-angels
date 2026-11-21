import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { mergeIdentityIntoSettings, type IdentityInput, type Settings } from "./orgIdentity";

/**
 * V4 Stage F: reads and writes behind Settings → Organization and Terms and
 * the Home checklist's dismiss. Callers MUST have passed
 * requirePermission("org.manage") first (the routes and pages do;
 * tests/role-guard-coverage.test.ts holds the routes to it).
 *
 * The org row and terminology go through the SESSION client with the active
 * org pinned in every filter, so RLS ("org managers update org" is
 * org.manage; org_terminology writes are staff.manage, which owner and admin
 * hold) is a second fence. Only fin_config (finance's own singleton per org,
 * read here for the fiscal year) uses the service role, read-only.
 */

export type OrgRow = { id: string; name: string; slug: string; settings: Settings | null };

export async function loadOrgRow(orgId: string): Promise<OrgRow | null> {
  const { data } = await createServerSupabase()
    .from("orgs")
    .select("id, name, slug, settings")
    .eq("id", orgId)
    .maybeSingle();
  return (data as OrgRow | null) ?? null;
}

export async function saveOrgIdentity(orgId: string, input: IdentityInput): Promise<{ before: Settings | null; error: string | null }> {
  const org = await loadOrgRow(orgId);
  if (!org) return { before: null, error: "Your organization could not be found." };
  const settings = mergeIdentityIntoSettings(org.settings, input);
  const { error } = await createServerSupabase().from("orgs").update({ name: input.name, settings }).eq("id", orgId);
  return { before: org.settings, error: error ? error.message : null };
}

/** Patch one top-level key of orgs.settings (the checklist's dismiss). */
export async function patchOrgSetting(orgId: string, key: string, value: unknown): Promise<string | null> {
  const org = await loadOrgRow(orgId);
  if (!org) return "Your organization could not be found.";
  const settings: Settings = { ...(org.settings ?? {}) };
  if (value === null) delete settings[key];
  else settings[key] = value;
  const { error } = await createServerSupabase().from("orgs").update({ settings }).eq("id", orgId);
  return error ? error.message : null;
}

export async function loadFiscalStartMonth(orgId: string): Promise<number | null> {
  const { data } = await getSupabaseAdmin()
    .from("fin_config")
    .select("fiscal_year_start_month")
    .eq("org_id", orgId)
    .maybeSingle();
  return (data?.fiscal_year_start_month as number | undefined) ?? null;
}

export async function loadTerms(orgId: string): Promise<Record<string, string>> {
  const { data } = await createServerSupabase().from("org_terminology").select("term_key, label").eq("org_id", orgId);
  return Object.fromEntries(((data ?? []) as { term_key: string; label: string }[]).map((r) => [r.term_key, r.label]));
}

/** Set (label) or reset (empty) each term, pinned to the org. */
export async function saveTerms(orgId: string, terms: Record<string, string>): Promise<string | null> {
  const supabase = createServerSupabase();
  const set = Object.entries(terms).filter(([, v]) => v);
  const reset = Object.entries(terms).filter(([, v]) => !v).map(([k]) => k);
  if (set.length) {
    const { error } = await supabase
      .from("org_terminology")
      .upsert(set.map(([term_key, label]) => ({ org_id: orgId, term_key, label })), { onConflict: "org_id,term_key" });
    if (error) return error.message;
  }
  if (reset.length) {
    const { error } = await supabase.from("org_terminology").delete().eq("org_id", orgId).in("term_key", reset);
    if (error) return error.message;
  }
  return null;
}
