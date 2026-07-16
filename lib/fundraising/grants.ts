import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Grant stages where the pursuit is finished — the money either landed and the
 * grant is fully wrapped up ('closed') or it isn't coming ('declined'). The
 * grant's workspace project has no remaining work in these stages, so it is
 * created as / moved to 'done' rather than 'active'. 'awarded' and 'active'
 * are NOT terminal: reporting and stewardship work is still live.
 */
export const TERMINAL_GRANT_STAGES = ["declined", "closed"] as const;

export const isTerminalGrantStage = (stage: string | null | undefined): boolean =>
  TERMINAL_GRANT_STAGES.includes(stage as (typeof TERMINAL_GRANT_STAGES)[number]);

/**
 * Resolve a funder name to a constituent id, creating the organization
 * constituent if no case-insensitive name match exists. The funder is always
 * an organization constituent (a shared record with its people). Shared by
 * grant create (POST) and grant edit (PATCH) so both behave identically.
 *
 * Returns `{ id }` on success or `{ error }` if the constituent insert failed.
 */
export async function findOrCreateFunder(
  supabase: SupabaseClient,
  orgId: string,
  funderName: string
): Promise<{ id: string } | { error: string }> {
  const name = funderName.trim();
  const { data: existing } = await supabase
    .from("constituents")
    .select("id")
    .eq("type", "organization")
    .ilike("org_name", name)
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data: created, error } = await supabase
    .from("constituents")
    .insert({ org_id: orgId, type: "organization", org_name: name, source: "manual" })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: created.id };
}

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
  grant: { id: string; org_id: string; name: string; stage: string },
  operator: string
): Promise<Record<string, unknown> | null> {
  const existing = await supabase
    .from("ops_projects")
    .select("*")
    .eq("grant_id", grant.id)
    .maybeSingle();
  if (existing.data) return existing.data;

  // A project self-healed for an already-declined/closed grant is born 'done' —
  // otherwise merely opening an old grant's page would resurrect it onto the
  // ops "Active Projects" surface.
  const terminal = isTerminalGrantStage(grant.stage);
  const created = await supabase
    .from("ops_projects")
    .insert({
      grant_id: grant.id,
      org_id: grant.org_id,
      title: grant.name,
      category: "fundraising",
      created_by: operator,
      status: terminal ? "done" : "active",
      ...(terminal ? { completed_at: new Date().toISOString() } : {}),
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
  orgId: string,
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
    org_id: orgId,
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

/**
 * Keep the grant's workspace project off the ops "Active Projects" surface
 * once the grant itself is finished: when a grant moves to a terminal stage
 * ('declined'/'closed'), mark its still-active project done. Close-only on
 * purpose — reopening a grant is rare and a project may have been marked done
 * by hand for its own reasons, so un-doing is left to the human (project
 * status is editable on /admin/ops/projects/:id). Best-effort: a failure here
 * must not fail the stage change itself.
 */
export async function syncGrantProjectStatus(
  supabase: SupabaseClient,
  grantId: string,
  stage: string
): Promise<void> {
  if (!isTerminalGrantStage(stage)) return;
  const { error } = await supabase
    .from("ops_projects")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("grant_id", grantId)
    .eq("status", "active");
  if (error) {
    console.error("[grants] project status sync failed:", error.message);
  }
}
