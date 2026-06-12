import type { SupabaseClient } from "@supabase/supabase-js";

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
