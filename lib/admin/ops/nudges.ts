import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Light Friday nudges (Operating Rhythm v2, Phase 9). Just a count + a link-out;
 * no inline metric entry, no inline CRM.
 *
 * Stale = a manual KPI whose last_updated_at is older than its cadence window
 * (or never updated). Auto KPIs refresh themselves and are excluded.
 */

const CADENCE_DAYS: Record<string, number> = { weekly: 7, monthly: 31, quarterly: 92 };

export async function countStaleKpis(orgId: string | null): Promise<number> {
  if (!orgId) return 0;
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb
      .from("plan_kpis")
      .select("cadence, last_updated_at, source")
      .eq("org_id", orgId)
      .eq("source", "manual");
    const now = Date.now();
    let count = 0;
    for (const k of (data as Array<{ cadence: string | null; last_updated_at: string | null }> | null) ??
      []) {
      const days = k.cadence ? CADENCE_DAYS[k.cadence] : undefined;
      if (!days) continue; // no cadence → not on a clock, can't be "stale"
      if (!k.last_updated_at) {
        count++;
        continue;
      }
      const ageDays = (now - new Date(k.last_updated_at).getTime()) / 86_400_000;
      if (ageDays > days) count++;
    }
    return count;
  } catch (e) {
    console.error("[nudges] stale kpis failed:", e);
    return 0;
  }
}
