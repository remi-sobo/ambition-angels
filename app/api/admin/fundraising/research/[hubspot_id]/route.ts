/**
 * POST /api/admin/fundraising/research/[hubspot_id]
 *
 * Trigger funder research brief generation for one HubSpot contact.
 *
 * Flow:
 *   1. Auth via isAuthed + getAdminUser.
 *   2. Rate limit: max 5 briefs / 10 min / triggering user.
 *   3. Monthly budget cap: estimate MTD agent spend from
 *      fr_agent_activity_log. 402 over $20, warning over $12.
 *   4. Generate brief (loads context + calls agent).
 *   5. Insert into fr_prospect_briefs (status='draft', template_version='v1').
 *   6. Insert into fr_agent_activity_log (success/partial/failed).
 *   7. Return the saved brief + any budget warning.
 *
 * Single mutation point for fr_prospect_briefs + fr_agent_activity_log in
 * this PR.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAuthed, getAdminUser } from "@/lib/admin/auth";
import { generateBriefForContact } from "@/lib/agents/funder-research/generate-brief";
import { AGENT_MODEL } from "@/lib/agents/funder-research/client";

// ── Cost + rate limit constants ───────────────────────────────────────────
// Opus rough rates per million tokens. Move to env / config when we have
// more than one model in play.
const OPUS_INPUT_PER_MILLION_USD = 15;
const OPUS_OUTPUT_PER_MILLION_USD = 75;
const MONTHLY_BUDGET_HARD_USD = 20;
const MONTHLY_BUDGET_WARN_USD = 12;

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 5;

const ACTION_TYPE = "research_brief" as const;

function estimateCostUsd(tokensInput: number, tokensOutput: number): number {
  return (
    (tokensInput * OPUS_INPUT_PER_MILLION_USD +
      tokensOutput * OPUS_OUTPUT_PER_MILLION_USD) /
    1_000_000
  );
}

// Maximum allowed Vercel function execution time. The agent's web-search
// loop can take 60-90s on a cold cache; bump the route timeout from the
// default. (Project is on Fluid Compute — 300s default applies, but we set
// this explicitly so it's discoverable.)
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: { hubspot_id: string } }
) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const currentUser = getAdminUser(req);
  if (!currentUser) {
    return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });
  }

  const hubspotId = params.hubspot_id;
  if (!hubspotId) {
    return NextResponse.json({ error: "Missing hubspot_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // ── 1. Rate limit ───────────────────────────────────────────────────────
  const windowStartIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: recentCount, error: rateErr } = await supabase
    .from("fr_agent_activity_log")
    .select("id", { count: "exact", head: true })
    .eq("action_type", ACTION_TYPE)
    .eq("triggered_by", currentUser)
    .gte("created_at", windowStartIso);
  if (rateErr) {
    console.error("[research] rate-limit query failed:", {
      code: rateErr.code,
      message: rateErr.message,
    });
  }
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      {
        error: `Rate limit: ${RATE_LIMIT_MAX} briefs per 10 minutes. Try again in a few minutes.`,
      },
      { status: 429 }
    );
  }

  // ── 2. Monthly budget cap ───────────────────────────────────────────────
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: mtdRows, error: mtdErr } = await supabase
    .from("fr_agent_activity_log")
    .select("tokens_input, tokens_output")
    .gte("created_at", monthStart.toISOString());
  if (mtdErr) {
    console.error("[research] mtd query failed:", {
      code: mtdErr.code,
      message: mtdErr.message,
    });
  }
  let mtdTokensInput = 0;
  let mtdTokensOutput = 0;
  for (const r of (mtdRows ?? []) as Array<{
    tokens_input: number | null;
    tokens_output: number | null;
  }>) {
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
      ? `Approaching monthly budget: $${mtdSpendUsd.toFixed(
          2
        )} of $${MONTHLY_BUDGET_HARD_USD}.`
      : null;

  // ── 3. Run the agent ────────────────────────────────────────────────────
  try {
    const { result } = await generateBriefForContact(hubspotId);

    // ── 4. Persist the brief ──────────────────────────────────────────────
    const { data: briefRow, error: briefErr } = await supabase
      .from("fr_prospect_briefs")
      .insert({
        hubspot_contact_id: hubspotId,
        content: result.brief,
        template_version: "v1",
        status: "draft",
        generated_at: new Date().toISOString(),
        created_by: "agent",
      })
      .select("*")
      .single();

    if (briefErr) {
      // We have a result but couldn't save it. Log the failure and tell the
      // caller — losing a brief silently would be worse than reporting it.
      console.error("[research] failed to persist brief:", {
        code: briefErr.code,
        message: briefErr.message,
      });
      await supabase.from("fr_agent_activity_log").insert({
        created_by: "agent",
        triggered_by: currentUser,
        action_type: ACTION_TYPE,
        hubspot_contact_id: hubspotId,
        target_id: null,
        target_type: "brief",
        prompt_summary: `Generate research brief for hubspot_id=${hubspotId}`,
        model_used: result.model_used,
        tokens_input: result.tokens_input,
        tokens_output: result.tokens_output,
        duration_ms: result.duration_ms,
        status: "partial",
        error_message: `Persist failed: ${briefErr.message}`,
        metadata: {
          web_search_count: result.web_search_count,
          estimated_cost_usd: Number(
            estimateCostUsd(result.tokens_input, result.tokens_output).toFixed(4)
          ),
        },
      });
      return NextResponse.json(
        { error: "Brief generated but could not be saved. Logged for review." },
        { status: 502 }
      );
    }

    // ── 5. Activity log: success ──────────────────────────────────────────
    await supabase.from("fr_agent_activity_log").insert({
      created_by: "agent",
      triggered_by: currentUser,
      action_type: ACTION_TYPE,
      hubspot_contact_id: hubspotId,
      target_id: briefRow.id,
      target_type: "brief",
      prompt_summary: `Generate research brief for hubspot_id=${hubspotId}`,
      model_used: result.model_used,
      tokens_input: result.tokens_input,
      tokens_output: result.tokens_output,
      duration_ms: result.duration_ms,
      status: "success",
      metadata: {
        web_search_count: result.web_search_count,
        estimated_cost_usd: Number(
          estimateCostUsd(result.tokens_input, result.tokens_output).toFixed(4)
        ),
      },
    });

    return NextResponse.json({
      brief: briefRow,
      budgetWarning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorCode = (err as { code?: string }).code;

    if (errorCode === "CONTACT_NOT_FOUND") {
      return NextResponse.json(
        { error: "Contact not found in hs_contacts. Try syncing HubSpot first." },
        { status: 404 }
      );
    }

    // Distinguish "agent ran but response couldn't be parsed" from
    // "Anthropic API errored." Both still log to activity_log; the user-
    // facing message differs.
    const isParseError =
      message.includes("missing required brief sections") ||
      message.includes("no JSON object") ||
      message.startsWith("SyntaxError") ||
      err instanceof SyntaxError;

    console.error("[research] agent failure:", {
      message,
      kind: isParseError ? "parse" : "api_or_unknown",
    });

    await supabase.from("fr_agent_activity_log").insert({
      created_by: "agent",
      triggered_by: currentUser,
      action_type: ACTION_TYPE,
      hubspot_contact_id: hubspotId,
      target_id: null,
      target_type: "brief",
      prompt_summary: `Generate research brief for hubspot_id=${hubspotId}`,
      model_used: AGENT_MODEL,
      status: isParseError ? "partial" : "failed",
      error_message: message,
      metadata: {
        kind: isParseError ? "parse_error" : "api_or_unknown_error",
      },
    });

    const userFacing = isParseError
      ? "Agent response could not be parsed. Logged for review."
      : `Agent error: ${message}`;
    return NextResponse.json({ error: userFacing }, { status: 502 });
  }
}
