import "server-only";
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Resident-org resolution for PUBLIC intake routes (the apply form, YGB
 * registration) that have no session to read an org from.
 *
 * These forms live on one org's public website, so the org is a deployment
 * fact, not a request fact. Resolving it HERE — one explicit, greppable
 * lookup by slug — replaces the hidden org_id column defaults the program
 * tables used to carry (the '17c75da8-…' trap, removed by
 * program_spine_schema.sql). A future multi-tenant public site passes the
 * org through the form instead; this helper is the single seam to change.
 *
 * Configurable via RESIDENT_ORG_SLUG; defaults to the resident org slug
 * the leak-test bootstrap also uses.
 */
export const getResidentOrgId = cache(async (): Promise<string> => {
  const slug = process.env.RESIDENT_ORG_SLUG || "ambition-angels";
  const { data, error } = await getSupabaseAdmin()
    .from("orgs")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Resident org "${slug}" not found — public intake cannot attribute rows`);
  }
  return data.id as string;
});
