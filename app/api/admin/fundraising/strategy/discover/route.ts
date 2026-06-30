/**
 * POST /api/admin/fundraising/strategy/discover — AI prospect discovery for a
 * strategy angle. Body: { angle_id, type }. Web-searches for net-new prospects
 * that fit the angle + type, returns a ranked candidate list (NOT persisted —
 * the client reviews and accepts onto the bench). Guarded by the shared agent
 * wallet + a rate limit, same as the research/NBA agents.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser, getOrgContext } from "@/lib/admin/auth";
import { logAICall } from "@/lib/ai/ledger";
import {
  runProspectDiscovery,
  estimateDiscoveryCostUsd,
  type DiscoveryType,
} from "@/lib/agents/prospect-discovery/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MONTHLY_BUDGET_HARD_USD = 20;
const MONTHLY_BUDGET_WARN_USD = 12;

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
  }
  const currentUser = await getAdminUser();
  if (!currentUser) return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { angle_id?: unknown; type?: unknown } | null;
  const angleId = typeof body?.angle_id === "string" ? body.angle_id : "";
  const type: DiscoveryType =
    body?.type === "foundation" || body?.type === "corporate" ? body.type : "individual";
  if (!angleId) return NextResponse.json({ error: "angle_id is required" }, { status: 400 });

  const supabase = createServerSupabase();

  // Rate limit + monthly budget (shared agent wallet).
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: recentCount } = await supabase
    .from("fr_agent_activity_log")
    .select("id", { count: "exact", head: true })
    .eq("triggered_by", currentUser)
    .filter("metadata->>kind", "eq", "prospect_discovery")
    .gte("created_at", windowStart);
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: `Rate limit: ${RATE_LIMIT_MAX} discovery runs per 10 minutes.` },
      { status: 429 }
    );
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: mtdRows } = await supabase
    .from("fr_agent_activity_log")
    .select("metadata")
    .gte("created_at", monthStart.toISOString());
  let mtdSpend = 0;
  for (const r of (mtdRows ?? []) as Array<{ metadata: { estimated_cost_usd?: number } | null }>) {
    const c = Number(r.metadata?.estimated_cost_usd ?? 0);
    if (Number.isFinite(c)) mtdSpend += c;
  }
  if (mtdSpend >= MONTHLY_BUDGET_HARD_USD) {
    return NextResponse.json(
      { error: `Monthly agent budget exceeded ($${MONTHLY_BUDGET_HARD_USD}). Resets next month.` },
      { status: 402 }
    );
  }
  const budgetWarning =
    mtdSpend >= MONTHLY_BUDGET_WARN_USD
      ? `Approaching monthly budget: $${mtdSpend.toFixed(2)} of $${MONTHLY_BUDGET_HARD_USD}.`
      : null;

  const { data: angle } = await supabase
    .from("strategy_angles")
    .select("id, name, hook")
    .eq("id", angleId)
    .maybeSingle();
  if (!angle) return NextResponse.json({ error: "Angle not found" }, { status: 404 });

  // Exclude what's already on the bench so we surface net-new names.
  const { data: benchRows } = await supabase.from("fr_prospects").select("name").limit(2000);
  const exclude = (benchRows ?? []).map((r) => r.name as string).filter(Boolean);

  let result;
  try {
    result = await runProspectDiscovery({
      angleName: angle.name as string,
      angleHook: (angle.hook as string | null) ?? null,
      type,
      exclude,
    });
  } catch (e) {
    console.error("[discover] agent error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Discovery failed" }, { status: 502 });
  }

  const costUsd = estimateDiscoveryCostUsd(result.tokens_input, result.tokens_output);
  await supabase.from("fr_agent_activity_log").insert({
    created_by: "agent",
    triggered_by: currentUser,
    action_type: "other",
    prompt_summary: `Prospect discovery for angle "${angle.name}" (${type})`,
    model_used: result.model_used,
    tokens_input: result.tokens_input,
    tokens_output: result.tokens_output,
    status: "success",
    metadata: {
      kind: "prospect_discovery",
      estimated_cost_usd: Number(costUsd.toFixed(4)),
      web_search_count: result.web_search_count,
      candidates: result.candidates.length,
    },
  });

  // Mirror into the unified AI ledger (additive; fr_agent_activity_log above
  // stays the agent-wallet cap source).
  const ctx = await getOrgContext();
  if (ctx?.orgId) {
    await logAICall(supabase, {
      orgId: ctx.orgId,
      surface: "prospect_discovery",
      model: result.model_used,
      tokensInput: result.tokens_input,
      tokensOutput: result.tokens_output,
      costUsd,
      triggeredBy: currentUser,
      status: "success",
      metadata: { web_search_count: result.web_search_count, candidates: result.candidates.length },
    });
  }

  return NextResponse.json({ candidates: result.candidates, budgetWarning });
}
