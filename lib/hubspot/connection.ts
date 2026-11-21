import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveEnvIntegrationOwner } from "@/lib/integrations/env-owner";

/**
 * HubSpot connection gate.
 *
 * BloomOS is standalone by default: nothing here writes to HubSpot unless an
 * org has an *active* HubSpot connection with outbound sync explicitly turned
 * on (`connections.meta.sync_out === true`). With no connection row — the
 * default — every check returns null and the outbound mappers no-op.
 *
 * Single-tenant by nature: the access token is ONE env credential
 * (HUBSPOT_ACCESS_TOKEN), so the only connection row that counts is the one
 * belonging to the org that owns the env integration
 * (lib/integrations/env-owner.ts). Every gate returns that org's id, and
 * callers must scope every record they read or write to it, so another org's
 * donors can never reach this portal and this portal's data never lands in
 * another org.
 *
 * `connections` is service-path only (RLS deny-all), so this uses the
 * service-role client.
 */
async function hubspotConnection(): Promise<{ orgId: string; meta: Record<string, unknown> } | null> {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) return null;
  try {
    const owner = await resolveEnvIntegrationOwner("hubspot");
    if (!owner.ok) return null;
    const { data } = await getSupabaseAdmin()
      .from("connections")
      .select("meta")
      .eq("org_id", owner.orgId)
      .eq("provider", "hubspot")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return { orgId: owner.orgId, meta: (data.meta ?? {}) as Record<string, unknown> };
  } catch {
    // Missing table / any error → fail closed (standalone).
    return null;
  }
}

/** The owner org id when outbound sync is on, else null. */
export async function hubspotWriteOrg(): Promise<string | null> {
  const c = await hubspotConnection();
  return c && c.meta.sync_out === true ? c.orgId : null;
}

/**
 * Pushing every gift to HubSpot as a closed-won Deal is opinionated (Deals are
 * really a pipeline construct), so it requires an extra opt-in beyond sync_out.
 * Opportunities → Deals only needs sync_out.
 */
export async function hubspotGiftDealsOrg(): Promise<string | null> {
  const c = await hubspotConnection();
  return c && c.meta.sync_out === true && c.meta.sync_gifts_as_deals === true ? c.orgId : null;
}

/**
 * Inbound (HubSpot → BloomOS) webhook apply is its own opt-in (`sync_in`), so
 * an org can run outbound-only, inbound-only, or both. Off by default →
 * webhooks are acknowledged but ignored.
 */
export async function hubspotReadOrg(): Promise<string | null> {
  const c = await hubspotConnection();
  return c && c.meta.sync_in === true ? c.orgId : null;
}
