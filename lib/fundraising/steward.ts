import type { SupabaseClient } from "@supabase/supabase-js";
import { assigneeSlug } from "@/lib/admin/assignees";

/**
 * Who works an org's stewardship/acknowledgment queue — the default assignee
 * for thank-you tasks, thankathon batches, and milestone touches when no
 * stewardship rule names one.
 *
 * Resolution: org_settings.default_steward → the org owner's handle →
 * 'shannon' (the legacy hardcode, kept only as the last-ditch fallback for a
 * database that predates the org_settings migration — which seeds tenant one
 * with 'shannon', so behavior there is identical either way).
 *
 * Callers all run on the service-role client (stewardship engine, thankathon
 * route, milestone cron), so the passed client can read org_settings through
 * its deny-all RLS.
 */

const cache = new Map<string, { value: string; at: number }>();
const TTL_MS = 60_000;

export async function getDefaultSteward(sb: SupabaseClient, orgId: string): Promise<string> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const value = await resolve(sb, orgId);
  cache.set(orgId, { value, at: Date.now() });
  return value;
}

async function resolve(sb: SupabaseClient, orgId: string): Promise<string> {
  const { data: settings } = await sb
    .from("org_settings")
    .select("default_steward")
    .eq("org_id", orgId)
    .maybeSingle();
  const configured = (settings?.default_steward as string | null)?.trim();
  if (configured) return configured.toLowerCase();

  const { data: ownerMem } = await sb
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const ownerId = (ownerMem?.user_id as string | undefined) ?? null;
  if (ownerId) {
    const { data: profile } = await sb
      .from("profiles")
      .select("display_name")
      .eq("user_id", ownerId)
      .maybeSingle();
    const handle = assigneeSlug(((profile?.display_name as string | null) ?? "").trim());
    if (handle) return handle;
  }

  return "shannon";
}
