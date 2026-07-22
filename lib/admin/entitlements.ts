import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, type OrgContext } from "@/lib/admin/auth";

/**
 * BloomOS entitlement reader + gates (core fence spec §6b).
 *
 * Entitlements are the per-tenant switchboard: module keys decide which parts
 * of BloomOS an org sees, feature/tier keys mark paid capabilities ('ai.reed'
 * + 'ai.prospect_research' are the Grow tier's AI switches, 'coaching' marks
 * Flourish; tiers are Bloom → Grow → Flourish), and aa.* flags fence the
 * resident org's website-coupled surfaces off from every other tenant. They live in org_entitlements, one enabled row per (org, feature);
 * the plan -> entitlement mapping is billing's job (later). These helpers only
 * answer "does this org hold this key, right now."
 *
 * Unknown keys are OFF. There are no code-side defaults per tenant — a
 * standard tenant's key set is seeded as data (runbook Appendix 1 for AA).
 *
 * Everything reads org_entitlements through the SESSION client, so RLS scopes
 * rows to the caller's own org (members read their own org's rows). Never the
 * service-role client — gating must not be able to leak a paid feature across
 * tenants.
 */

// The full key vocabulary. The sidebar nav config and module layouts reference
// these; a typo'd key is a compile error, not a silently-hidden module.
export const FEATURE_KEYS = [
  // Module switches — on for a standard tenant unless noted (as seed DATA,
  // never in code; the reader itself defaults everything to off).
  "modules.fundraising",
  "modules.finance",
  "modules.program",
  "modules.ops",
  "modules.board",
  "modules.compliance",
  "modules.strategy",
  "modules.staff",
  "modules.reviews", // default off for new tenants
  "modules.partners", // default off for new tenants
  "modules.meetings",
  "modules.comms",
  "modules.messages",
  "modules.documents",
  "modules.metrics",
  // Feature/tier switches.
  "ai.reed",
  "ai.prospect_research",
  "coaching",
  // AA-only flags — on for AA, never seeded for anyone else. These fence the
  // marketing-site-coupled surfaces (core fence spec §6a, AA-site class).
  "aa.demoday",
  "aa.ygb",
  "aa.mesa",
  "aa.quiz",
  "aa.bv",
  "aa.site_analytics",
  "aa.hubspot_mirror",
  "aa.app", // the Ambition App roadmap surface — AA-only, not a generic module
  "aa.internships", // AA internships surface — AA-only
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Legacy alias from the Reed-era module; same vocabulary now. */
export type EntitlementKey = FeatureKey;

export type Entitlements = ReadonlySet<string>;

// react.cache memoizes per request in the Next server build; it doesn't exist
// in the plain Node build vitest loads, so fall back to no memoization there.
const perRequest: <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R =
  typeof cache === "function" ? cache : (fn) => fn;

/**
 * All enabled feature keys for an org — ONE query, request-cached, so the
 * shell (sidebar + Reed gate) and every module-layout guard in the same
 * render share a single read.
 */
export const getEntitlements = perRequest(async (orgId: string): Promise<Entitlements> => {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("org_entitlements")
    .select("feature_key")
    .eq("org_id", orgId)
    .eq("enabled", true);
  return new Set((data ?? []).map((r) => r.feature_key as string));
});

/** Pure check against a loaded set. Unknown/missing keys are off. */
export function hasFeature(ents: Entitlements, key: FeatureKey): boolean {
  return ents.has(key);
}

/**
 * UI/server-component gate: true when the session org holds an enabled
 * entitlement. Use for show/hide affordances like the "Ask Reed" FAB.
 * Returns false for the unauthenticated/unprovisioned case rather than
 * throwing. Prefer getEntitlements + hasFeature when checking several keys.
 */
export async function hasEntitlement(key: FeatureKey): Promise<boolean> {
  const ctx = await getOrgContext();
  if (!ctx) return false;
  return hasFeature(await getEntitlements(ctx.orgId), key);
}

export type EntitlementResult =
  | { ok: true; ctx: OrgContext }
  | { ok: false; status: 401 | 402; error: string };

/**
 * Route gate: resolve the session org and confirm the entitlement in one call.
 * Returns the org context when entitled, or a status to return verbatim:
 *   401 — unauthenticated / not a member of any org
 *   402 — authenticated but the org lacks the entitlement (the upsell boundary)
 *
 *   const ent = await requireEntitlement("ai.reed");
 *   if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
 *   // ...use ent.ctx.orgId
 */
export async function requireEntitlement(key: FeatureKey): Promise<EntitlementResult> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, status: 401, error: "Unauthorized" };
  if (!hasFeature(await getEntitlements(ctx.orgId), key)) {
    return { ok: false, status: 402, error: `This feature requires an upgrade (${key}).` };
  }
  return { ok: true, ctx };
}
