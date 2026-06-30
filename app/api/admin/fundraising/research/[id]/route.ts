/**
 * POST /api/admin/fundraising/research/[prospect_id]
 *
 * Kick off funder research for one prospect, in the BACKGROUND. The request
 * validates + rate-limits + budget-checks, creates a research_runs row
 * (status 'running'), and returns immediately with the run id. The agent run,
 * brief persistence, activity-log entry, run-status update, and the
 * completion/failure notification all happen after the response via
 * runInBackground (waitUntil), so the user can navigate away and be notified
 * when it finishes. Status is queryable at GET .../[id]/run.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext, getAdminUser, type AdminUser } from "@/lib/admin/auth";
import { notify } from "@/lib/notifications/notify";
import { runInBackground } from "@/lib/background";
import { generateBriefForProspect } from "@/lib/agents/funder-research/generate-brief";
import {
  AGENT_MODEL,
  AgentResultError,
} from "@/lib/agents/funder-research/client";
import { estimateCostUsd as estimateModelCostUsd } from "@/lib/ai/cost";

// ── Cost + rate limit constants ───────────────────────────────────────────
const MONTHLY_BUDGET_HARD_USD = 20;
const MONTHLY_BUDGET_WARN_USD = 12;

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 5;

const ACTION_TYPE = "research_brief" as const;

// Delegates to the shared price sheet (lib/ai/cost.ts) at the funder agent's
// model; numbers are unchanged (Opus). Local wrapper keeps call sites simple.
function estimateCostUsd(tokensInput: number, tokensOutput: number): number {
  return estimateModelCostUsd(AGENT_MODEL, tokensInput, tokensOutput);
}

type Prospect = {
  id: string;
  hubspot_contact_id: string | null;
  name: string;
  email: string | null;
  org_name: string | null;
  type: string;
};

// The agent's web-search loop can take 60-90s; the background task runs within
// this same invocation's lifetime, so keep the route's max duration high.
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const currentUser = await getAdminUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });
  }

  const prospectId = params.id;
  if (!prospectId) {
    return NextResponse.json({ error: "Missing prospect id" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: prospectRow } = await supabase
    .from("fr_prospects")
    .select("id, hubspot_contact_id, name, email, org_name, type")
    .eq("id", prospectId)
    .maybeSingle();
  const prospect = prospectRow as Prospect | null;
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }
  const hubspotId = prospect.hubspot_contact_id;

  // ── 1. Rate limit (fail fast, before starting a run) ──────────────────────
  const windowStartIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: recentCount, error: rateErr } = await supabase
    .from("fr_agent_activity_log")
    .select("id", { count: "exact", head: true })
    .eq("action_type", ACTION_TYPE)
    .eq("triggered_by", currentUser)
    .gte("created_at", windowStartIso);
  if (rateErr) {
    console.error("[research] rate-limit query failed:", { code: rateErr.code, message: rateErr.message });
  }
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: `Rate limit: ${RATE_LIMIT_MAX} briefs per 10 minutes. Try again in a few minutes.` },
      { status: 429 }
    );
  }

  // ── 2. Monthly budget cap ─────────────────────────────────────────────────
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: mtdRows, error: mtdErr } = await supabase
    .from("fr_agent_activity_log")
    .select("tokens_input, tokens_output")
    .gte("created_at", monthStart.toISOString());
  if (mtdErr) {
    console.error("[research] mtd query failed:", { code: mtdErr.code, message: mtdErr.message });
  }
  let mtdTokensInput = 0;
  let mtdTokensOutput = 0;
  for (const r of (mtdRows ?? []) as Array<{ tokens_input: number | null; tokens_output: number | null }>) {
    mtdTokensInput += r.tokens_input ?? 0;
    mtdTokensOutput += r.tokens_output ?? 0;
  }
  const mtdSpendUsd = estimateCostUsd(mtdTokensInput, mtdTokensOutput);
  if (mtdSpendUsd >= MONTHLY_BUDGET_HARD_USD) {
    return NextResponse.json(
      {
        error: `Monthly agent budget exceeded ($${MONTHLY_BUDGET_HARD_USD}). Resets next month.`,
        mtd_spend_usd: Number(mtdSpendUsd.toFixed(2)),
      },
      { status: 402 }
    );
  }
  const budgetWarning =
    mtdSpendUsd >= MONTHLY_BUDGET_WARN_USD
      ? `Approaching monthly budget: $${mtdSpendUsd.toFixed(2)} of $${MONTHLY_BUDGET_HARD_USD}.`
      : null;

  // ── 3. Create the run record, then run the agent in the background ────────
  const admin = getSupabaseAdmin();
  const { data: runRow, error: runErr } = await admin
    .from("research_runs")
    .insert({
      org_id: ctx.orgId, // from session — never a column default
      prospect_id: prospectId,
      status: "running",
      started_by: ctx.userId,
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    console.error("[research] failed to create run row:", runErr?.message);
    return NextResponse.json({ error: "Could not start research run." }, { status: 500 });
  }
  const runId = (runRow as { id: string }).id;

  runInBackground(() =>
    runResearch({ runId, prospect, prospectId, hubspotId, orgId: ctx.orgId, userId: ctx.userId, currentUser })
  );

  // 202: accepted, work continues server-side. The client polls .../[id]/run.
  return NextResponse.json({ runId, status: "running", budgetWarning }, { status: 202 });
}

// ── Background worker ───────────────────────────────────────────────────────

type RunCtx = {
  runId: string;
  prospect: Prospect;
  prospectId: string;
  hubspotId: string | null;
  orgId: string;
  userId: string;
  currentUser: AdminUser;
};

async function runResearch(rc: RunCtx): Promise<void> {
  const admin = getSupabaseAdmin();
  const label = rc.prospect.org_name || rc.prospect.name;
  const link = `/admin/fundraising/prospects/${rc.prospectId}`;
  const nowIso = () => new Date().toISOString();

  const markCompleted = async (briefId: string) => {
    await admin
      .from("research_runs")
      .update({ status: "completed", brief_id: briefId, finished_at: nowIso(), updated_at: nowIso() })
      .eq("id", rc.runId);
    await notify({
      orgId: rc.orgId,
      recipientId: rc.userId,
      type: "research.completed",
      title: `Funder research finished: ${label}`,
      body: `Your research brief for ${rc.prospect.name} is ready.`,
      linkedEntityType: "fr_prospects",
      linkedEntityId: rc.prospectId,
      linkedLabel: label,
      url: link,
    }).catch((e) => console.error("[research] notify(completed) failed:", e));
  };

  const markFailed = async (reason: string) => {
    await admin
      .from("research_runs")
      .update({ status: "failed", error: reason.slice(0, 1000), finished_at: nowIso(), updated_at: nowIso() })
      .eq("id", rc.runId);
    await notify({
      orgId: rc.orgId,
      recipientId: rc.userId,
      type: "research.failed",
      title: `Funder research failed: ${label}`,
      body: reason,
      linkedEntityType: "fr_prospects",
      linkedEntityId: rc.prospectId,
      linkedLabel: label,
      url: link,
    }).catch((e) => console.error("[research] notify(failed) failed:", e));
  };

  try {
    const { result } = await generateBriefForProspect(rc.prospect);

    const { data: briefRow, error: briefErr } = await admin
      .from("fr_prospect_briefs")
      .insert({
        prospect_id: rc.prospectId,
        hubspot_contact_id: rc.hubspotId,
        content: result.brief,
        template_version: "v1",
        status: "draft",
        generated_at: nowIso(),
        created_by: "agent",
      })
      .select("id")
      .single();

    if (briefErr) {
      console.error("[research] failed to persist brief:", { code: briefErr.code, message: briefErr.message });
      await admin.from("fr_agent_activity_log").insert({
        created_by: "agent",
        triggered_by: rc.currentUser,
        action_type: ACTION_TYPE,
        hubspot_contact_id: rc.hubspotId,
        target_id: null,
        target_type: "brief",
        prompt_summary: `Generate research brief for prospect=${rc.prospectId}`,
        model_used: result.model_used,
        tokens_input: result.tokens_input,
        tokens_output: result.tokens_output,
        duration_ms: result.duration_ms,
        status: "partial",
        error_message: `Persist failed: ${briefErr.message}`,
        metadata: {
          web_search_count: result.web_search_count,
          estimated_cost_usd: Number(estimateCostUsd(result.tokens_input, result.tokens_output).toFixed(4)),
        },
      });
      await markFailed("Brief generated but couldn't be saved. Logged for review.");
      return;
    }

    await admin.from("fr_agent_activity_log").insert({
      created_by: "agent",
      triggered_by: rc.currentUser,
      action_type: ACTION_TYPE,
      hubspot_contact_id: rc.hubspotId,
      target_id: briefRow.id,
      target_type: "brief",
      prompt_summary: `Generate research brief for prospect=${rc.prospectId}`,
      model_used: result.model_used,
      tokens_input: result.tokens_input,
      tokens_output: result.tokens_output,
      duration_ms: result.duration_ms,
      status: "success",
      metadata: {
        web_search_count: result.web_search_count,
        estimated_cost_usd: Number(estimateCostUsd(result.tokens_input, result.tokens_output).toFixed(4)),
      },
    });

    await markCompleted(briefRow.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorCode = (err as { code?: string }).code;

    if (errorCode === "CONTACT_NOT_FOUND") {
      await markFailed("Contact not found in hs_contacts. Try syncing HubSpot first.");
      return;
    }

    if (err instanceof AgentResultError) {
      console.error("[research] tool extraction failed:", { message: err.message });
      await admin.from("fr_agent_activity_log").insert({
        created_by: "agent",
        triggered_by: rc.currentUser,
        action_type: ACTION_TYPE,
        hubspot_contact_id: rc.hubspotId,
        target_id: null,
        target_type: "brief",
        prompt_summary: `Generate research brief for prospect=${rc.prospectId}`,
        model_used: err.metrics.model_used,
        tokens_input: err.metrics.tokens_input,
        tokens_output: err.metrics.tokens_output,
        duration_ms: err.metrics.duration_ms,
        status: "partial",
        error_message: err.message,
        metadata: {
          kind: "tool_extraction_failure",
          web_search_count: err.metrics.web_search_count,
          estimated_cost_usd: Number(
            estimateCostUsd(err.metrics.tokens_input, err.metrics.tokens_output).toFixed(4)
          ),
          raw_response_summary: err.raw_response_summary ?? null,
        },
      });
      await markFailed("The agent didn't return a valid brief. Logged for review.");
      return;
    }

    console.error("[research] agent failure (api or unknown):", { message });
    await admin.from("fr_agent_activity_log").insert({
      created_by: "agent",
      triggered_by: rc.currentUser,
      action_type: ACTION_TYPE,
      hubspot_contact_id: rc.hubspotId,
      target_id: null,
      target_type: "brief",
      prompt_summary: `Generate research brief for prospect=${rc.prospectId}`,
      model_used: AGENT_MODEL,
      status: "failed",
      error_message: message,
      metadata: { kind: "api_or_unknown_error" },
    });
    await markFailed(`Agent error: ${message}`);
  }
}
