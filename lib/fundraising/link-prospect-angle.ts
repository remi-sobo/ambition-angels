import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveConstituent } from "./constituent-resolve";

/**
 * Attach a bench prospect (fr_prospects) to a strategy angle's funnel.
 *
 * funder_angles is constituent-backed (pursue creates an opportunity from the
 * constituent), so we ensure the prospect has a constituent first — resolving
 * or creating one and stamping it back on the prospect — then insert a
 * funder_angles row carrying prospect_id. Idempotent: a prospect already on the
 * angle is left in place (with prospect_id backfilled).
 */
export type LinkResult =
  | { id: string }
  | { skipped: true }
  | { error: string; status: number };

export async function linkProspectToAngle(
  supabase: SupabaseClient,
  prospectId: string,
  angleId: string,
  createdBy: string | null
): Promise<LinkResult> {
  const { data: p } = await supabase
    .from("fr_prospects")
    .select("id, name, constituent_id")
    .eq("id", prospectId)
    .maybeSingle();
  if (!p) return { error: "Prospect not found", status: 404 };

  let constituentId = (p.constituent_id as string | null) ?? null;
  if (!constituentId) {
    const resolved = await resolveConstituent(supabase, { name: p.name as string });
    if ("error" in resolved) return { error: resolved.error, status: resolved.status };
    constituentId = resolved.constituentId;
    await supabase.from("fr_prospects").update({ constituent_id: constituentId }).eq("id", prospectId);
  }

  const { data: existing } = await supabase
    .from("funder_angles")
    .select("id")
    .eq("angle_id", angleId)
    .eq("constituent_id", constituentId)
    .maybeSingle();
  if (existing) {
    await supabase.from("funder_angles").update({ prospect_id: prospectId }).eq("id", existing.id as string);
    return { skipped: true };
  }

  const { data, error } = await supabase
    .from("funder_angles")
    .insert({ angle_id: angleId, constituent_id: constituentId, prospect_id: prospectId, stage: "shortlist", created_by: createdBy })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      await supabase
        .from("funder_angles")
        .update({ prospect_id: prospectId })
        .eq("angle_id", angleId)
        .eq("constituent_id", constituentId);
      return { skipped: true };
    }
    console.error("[linkProspectToAngle] insert failed:", error?.message);
    return { error: "Could not link to angle", status: 500 };
  }
  return { id: data.id as string };
}
