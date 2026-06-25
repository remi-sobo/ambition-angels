import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The project that backs a grant's workspace. Every grant has exactly one
 * (unique partial index on ops_projects.grant_id). Phase 2 creates it on grant
 * creation; this is the self-heal for grants made before that, or whose project
 * insert failed: it returns the existing project or creates the missing one.
 *
 * Idempotent against the unique index — if a concurrent caller wins the race,
 * we re-read the winner rather than surfacing the unique violation. org_id is
 * set explicitly from the grant row (never the column default), so it stays
 * correct once a second tenant exists. Pass the *authenticated* server client
 * so ops_projects RLS (has_permission(org_id,'ops.write')) governs the write.
 *
 * Returns the project row, or null if it could neither be read nor created.
 */
export async function ensureGrantProject(
  supabase: SupabaseClient,
  grant: { id: string; org_id: string; name: string },
  operator: string
): Promise<Record<string, unknown> | null> {
  const existing = await supabase
    .from("ops_projects")
    .select("*")
    .eq("grant_id", grant.id)
    .maybeSingle();
  if (existing.data) return existing.data;

  const created = await supabase
    .from("ops_projects")
    .insert({
      grant_id: grant.id,
      org_id: grant.org_id,
      title: grant.name,
      category: "fundraising",
      created_by: operator,
      status: "active",
    })
    .select("*")
    .maybeSingle();
  if (created.data) return created.data;

  // Lost a race (unique violation) — re-read the winner.
  const reread = await supabase
    .from("ops_projects")
    .select("*")
    .eq("grant_id", grant.id)
    .maybeSingle();
  return reread.data ?? null;
}

/**
 * "Awarded grants auto-plot their reporting schedule" (modules/03 Grants
 * v1): when an award lands and the grant has a period end but no report
 * deadline yet, plot a final report at the period end. Shared by grant
 * create and stage-advance so both paths behave identically.
 *
 * Returns true when a requirement was created.
 */
export async function autoPlotFinalReport(
  supabase: SupabaseClient,
  grantId: string,
  periodEnd: string | null | undefined
): Promise<boolean> {
  if (!periodEnd) return false;
  const { count } = await supabase
    .from("grant_requirements")
    .select("id", { count: "exact", head: true })
    .eq("grant_id", grantId)
    .in("kind", ["interim_report", "final_report", "financial_report"]);
  if ((count ?? 0) > 0) return false;
  const { error } = await supabase.from("grant_requirements").insert({
    grant_id: grantId,
    kind: "final_report",
    due_date: periodEnd,
    notes: "Auto-plotted at award — adjust to the funder's actual reporting deadline.",
  });
  if (error) {
    console.error("[grants] final-report auto-plot failed:", error.message);
    return false;
  }
  return true;
}
