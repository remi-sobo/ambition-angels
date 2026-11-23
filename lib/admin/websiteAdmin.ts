import { createServerSupabase } from "@/lib/supabase/server";
import { hasFeature, type Entitlements } from "@/lib/admin/entitlements";

/**
 * The "Website admin" sidebar link (specs/bloomos-repo-split.md §6e item 4).
 *
 * Ambition Angels' own website admin lives on its own site, outside BloomOS.
 * The link shows only when the org holds aa.site_admin AND has a
 * website_admin_url in orgs.settings. The URL is data on the org row, so no
 * tenant's address is written into BloomOS code.
 */

/** Only absolute https URLs survive. Anything else hides the link. */
export function parseWebsiteAdminUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function getWebsiteAdminUrl(orgId: string, ents: Entitlements): Promise<string | null> {
  if (!hasFeature(ents, "aa.site_admin")) return null;
  // Session client: members read their own org row (RLS "members read org").
  const { data } = await createServerSupabase().from("orgs").select("settings").eq("id", orgId).maybeSingle();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return parseWebsiteAdminUrl(settings.website_admin_url);
}
