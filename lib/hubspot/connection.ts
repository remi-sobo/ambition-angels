import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * HubSpot connection gate.
 *
 * BloomOS is standalone by default: nothing here writes to HubSpot unless an
 * org has an *active* HubSpot connection with outbound sync explicitly turned
 * on (`connections.meta.sync_out === true`). With no connection row — the
 * default — every check returns false and the outbound mappers no-op, so the
 * product behaves exactly as it does today.
 *
 * `connections` is service-path only (RLS deny-all), so this uses the
 * service-role client. The access token still comes from HUBSPOT_ACCESS_TOKEN
 * for now (same as the read sync); moving it into the encrypted
 * `connections.access_token_enc` column is a follow-up.
 */
export async function hubspotWriteEnabled(): Promise<boolean> {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) return false;
  try {
    const { data } = await getSupabaseAdmin()
      .from("connections")
      .select("meta")
      .eq("provider", "hubspot")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!data) return false;
    const meta = (data.meta ?? {}) as Record<string, unknown>;
    return meta.sync_out === true;
  } catch {
    // Missing table / any error → fail closed (standalone).
    return false;
  }
}
