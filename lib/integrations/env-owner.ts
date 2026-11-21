import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, type OrgContext } from "@/lib/admin/auth";

/**
 * Owner of the env-configured integrations.
 *
 * Some integrations authenticate with ONE credential from the deployment's
 * environment, not a per-org connection: HubSpot (HUBSPOT_ACCESS_TOKEN, a
 * private-app token for Ambition Angels' portal) and the Gmail interaction
 * sync (GOOGLE_REFRESH_TOKEN, one mailbox). They are single-tenant by nature,
 * so every read, write, sync and "connect" path must act for exactly the org
 * that owns the credential, and refuse for every other org.
 *
 * The owner is decided by data, not code: the one org holding the
 * `aa.hubspot_mirror` entitlement (seeded for AA by
 * supabase/migrations/seed_aa_hubspot_mirror_entitlement.sql; aa.* keys are
 * never seeded for another tenant). No row, or more than one, resolves to
 * nothing, and callers then do nothing. Never `limit(1)` and hope.
 *
 * The Gmail sync reuses the same key because the env mailbox belongs to the
 * same resident org and no Gmail-specific key exists yet; giving it its own
 * key is a one-row seed plus a change to OWNER_KEY below.
 *
 * Service-role read: crons and webhooks have no session. It returns org ids
 * only, never another tenant's data.
 */

export type EnvIntegration = "hubspot" | "gmail_sync";

const OWNER_KEY: Record<EnvIntegration, string> = {
  hubspot: "aa.hubspot_mirror",
  gmail_sync: "aa.hubspot_mirror",
};

export type OwnerResolution = { ok: true; orgId: string } | { ok: false; reason: string };

export async function resolveEnvIntegrationOwner(integration: EnvIntegration): Promise<OwnerResolution> {
  const key = OWNER_KEY[integration];
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("org_entitlements")
      .select("org_id")
      .eq("feature_key", key)
      .eq("enabled", true)
      .limit(2);
    if (error) return { ok: false, reason: `could not read the ${key} entitlement: ${error.message}` };
    const orgIds = Array.from(new Set((data ?? []).map((r) => r.org_id as string)));
    if (orgIds.length === 0) return { ok: false, reason: `no org holds the ${key} entitlement` };
    if (orgIds.length > 1) {
      return { ok: false, reason: `more than one org holds the ${key} entitlement; refusing to guess` };
    }
    return { ok: true, orgId: orgIds[0] };
  } catch (e) {
    return { ok: false, reason: `could not resolve the ${integration} owner: ${(e as Error).message}` };
  }
}

/** True only when `orgId` is the resolved owner of the env integration. */
export async function isEnvIntegrationOwner(integration: EnvIntegration, orgId: string): Promise<boolean> {
  const owner = await resolveEnvIntegrationOwner(integration);
  return owner.ok && owner.orgId === orgId;
}

/** The plain-language refusal shown to a non-owner org. */
export const NOT_OWNER_MESSAGE: Record<EnvIntegration, string> = {
  hubspot:
    "HubSpot isn't available for this organization. The HubSpot connection on BloomOS belongs to another organization.",
  gmail_sync:
    "Gmail sync isn't available for this organization. The synced mailbox belongs to another organization.",
};

export type OwnerGate =
  | { ok: true; ctx: OrgContext }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Route gate: the session org must be the owner of the env integration.
 * 401 with no session, 403 for any other org (including when the owner can't
 * be resolved unambiguously).
 */
export async function requireEnvIntegrationOwner(integration: EnvIntegration): Promise<OwnerGate> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, status: 401, error: "Unauthorized" };
  if (!(await isEnvIntegrationOwner(integration, ctx.orgId))) {
    return { ok: false, status: 403, error: NOT_OWNER_MESSAGE[integration] };
  }
  return { ok: true, ctx };
}
