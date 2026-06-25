import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, type OrgContext } from "@/lib/admin/auth";

/**
 * BloomOS entitlement gate (Reed Phase 2).
 *
 * Entitlements are the tier boundary: 'ai.reed' separates Bloom from Bloom Grow,
 * 'coaching' marks Bloom Flourish. They live in org_entitlements, one enabled
 * row per (org, feature). The plan -> entitlement mapping is billing's job
 * (later); these helpers only answer "does this org hold this key, right now."
 *
 * Both helpers read org_entitlements through the SESSION client, so RLS scopes
 * the row to the caller's own org (members read their own org's rows). They
 * never use the service-role client — gating must not be able to leak a paid
 * feature across tenants.
 */

export type EntitlementKey = "ai.reed" | "coaching";

/**
 * UI/server-component gate: true when the (session, or given) org holds an
 * enabled entitlement. Use for show/hide affordances like the "Ask Reed" FAB.
 * Returns false for the unauthenticated/unprovisioned case rather than throwing.
 */
export async function hasEntitlement(key: EntitlementKey): Promise<boolean> {
  const ctx = await getOrgContext();
  if (!ctx) return false;
  return entitledFor(ctx.orgId, key);
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
export async function requireEntitlement(key: EntitlementKey): Promise<EntitlementResult> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, status: 401, error: "Unauthorized" };
  if (!(await entitledFor(ctx.orgId, key))) {
    return { ok: false, status: 402, error: `This feature requires an upgrade (${key}).` };
  }
  return { ok: true, ctx };
}

/** Single enabled-row lookup, RLS-scoped via the session client. */
async function entitledFor(orgId: string, key: EntitlementKey): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("org_entitlements")
    .select("enabled")
    .eq("org_id", orgId)
    .eq("feature_key", key)
    .eq("enabled", true)
    .maybeSingle();
  return !!data;
}
