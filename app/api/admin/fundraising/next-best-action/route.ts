/**
 * NBA agent (Phase 2), persisted.
 *
 * POST gathers the open moves-pipeline opportunities with real giving +
 * engagement facts, asks the agent to rank them and propose one next action
 * each, persists the batch to fr_nba_suggestions (superseding any still-open
 * suggestion for the same opportunity), and returns the cards. GET reloads the
 * current open suggestions so they survive reloads without re-running the
 * agent. Both return follow-through stats (applied vs. dismissed).
 *
 * Applying a card writes next_step/next_step_due via the opportunities PATCH
 * route and marks the suggestion 'applied' via [id]/route.ts — neither is done
 * here; this route never mutates an opportunity.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";
import { todayISO } from "@/app/admin/ops/_types/ops";
import { runNextBestAction, estimateNbaCostUsd } from "@/lib/agents/next-best-action/agent";
import { logAICall } from "@/lib/ai/ledger";
import { orgOverAICap } from "@/lib/ai/cap";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { OPEN_STAGE_LIST } from "@/lib/fundraising/stage-sets";

// Shared monthly agent wallet (same cap as the research route) + a rate limit,
// so "Suggest next moves" can't run uncapped.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MONTHLY_BUDGET_HARD_USD = 20;
const MONTHLY_BUDGET_WARN_USD = 12;
import type {
  NbaCandidate,
  NbaCardRecommendation,
  NbaChannel,
  NbaStats,
} from "@/lib/agents/next-best-action/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CANDIDATES = 25;
const DAY = 86_400_000;
const daysSince = (iso: string | null): number | null =>
  iso ? Math.floor((Date.now() - Date.parse(iso.length === 10 ? iso + "T00:00:00" : iso)) / DAY) : null;

type OppRow = {
  id: string;
  stage: string;
  ask_amount: number | null;
  expected_close: string | null;
  next_step: string | null;
  next_step_due: string | null;
  capacity_rating: number | null;
  updated_at: string | null;
  constituent: {
    id: string;
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
  } | null;
};

type Supabase = ReturnType<typeof createServerSupabase>;

async function fetchStats(supabase: Supabase): Promise<NbaStats> {
  const [a, d] = await Promise.all([
    supabase.from("fr_nba_suggestions").select("id", { count: "exact", head: true }).eq("status", "applied"),
    supabase.from("fr_nba_suggestions").select("id", { count: "exact", head: true }).eq("status", "dismissed"),
  ]);
  return { applied: a.count ?? 0, dismissed: d.count ?? 0 };
}

// Current open suggestions, joined live to their opportunity + constituent so
// names/asks stay fresh and dropped opportunities fall away.
async function openSuggestionCards(supabase: Supabase): Promise<NbaCardRecommendation[]> {
  const today = todayISO();
  const { data } = await supabase
    .from("fr_nba_suggestions")
    .select(
      `id, opportunity_id, priority, action, rationale, channel, suggested_due,
       opportunity:opportunities ( id, stage, ask_amount,
         constituent:constituents ( id, type, first_name, last_name, org_name ) )`
    )
    .eq("status", "suggested")
    .order("priority", { ascending: true })
    .limit(50);

  type Row = {
    id: string;
    opportunity_id: string;
    priority: number | null;
    action: string;
    rationale: string | null;
    channel: string | null;
    suggested_due: string | null;
    opportunity: {
      id: string;
      stage: string;
      ask_amount: number | null;
      constituent: OppRow["constituent"];
    } | null;
  };

  const cards: NbaCardRecommendation[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.opportunity) continue; // opportunity gone
    const due = r.suggested_due ?? today;
    cards.push({
      id: r.id,
      opportunity_id: r.opportunity_id,
      priority: r.priority ?? 999,
      action: r.action,
      rationale: r.rationale ?? "",
      channel: (r.channel as NbaChannel) ?? "other",
      suggested_due_in_days: Math.max(0, Math.round((Date.parse(due + "T00:00:00") - Date.now()) / DAY)),
      constituent_id: r.opportunity.constituent?.id ?? null,
      constituent_name: r.opportunity.constituent ? constituentName(r.opportunity.constituent) : "Unknown",
      stage: r.opportunity.stage,
      ask_amount: r.opportunity.ask_amount,
      next_step_due: due,
    });
  }
  return cards;
}

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServerSupabase();
  const [recommendations, stats] = await Promise.all([openSuggestionCards(supabase), fetchStats(supabase)]);
  return NextResponse.json({ recommendations, stats });
}

export async function POST() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
  }

  const supabase = createServerSupabase();
  const today = todayISO();

  const currentUser = await getAdminUser();
  if (!currentUser) return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });

  // Rate limit: count this user's recent NBA runs in the activity log.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: recentCount } = await supabase
    .from("fr_agent_activity_log")
    .select("id", { count: "exact", head: true })
    .eq("triggered_by", currentUser)
    .filter("metadata->>kind", "eq", "next_best_action")
    .gte("created_at", windowStart);
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: `Rate limit: ${RATE_LIMIT_MAX} suggestion runs per 10 minutes. Try again shortly.` },
      { status: 429 }
    );
  }

  // Monthly budget: sum estimated cost across all agent runs this month.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: mtdRows } = await supabase
    .from("fr_agent_activity_log")
    .select("metadata")
    .gte("created_at", monthStart.toISOString());
  let mtdSpendUsd = 0;
  for (const r of (mtdRows ?? []) as Array<{ metadata: { estimated_cost_usd?: number } | null }>) {
    const c = Number(r.metadata?.estimated_cost_usd ?? 0);
    if (Number.isFinite(c)) mtdSpendUsd += c;
  }
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

  // Global org backstop across ALL AI surfaces (above this agent's budget). Fail-open.
  // isAuthed() above guarantees a session org — every write below attributes to
  // this org (never a resident-org fallback).
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  {
    const orgCap = await orgOverAICap(supabase, ctx.orgId);
    if (orgCap.over) {
      return NextResponse.json(
        { error: `This org has reached its monthly AI spend cap ($${orgCap.capUsd}). Resets next month.`, mtd_spend_usd: Number(orgCap.spentUsd.toFixed(2)) },
        { status: 402 }
      );
    }
  }

  const { data: oppData, error: oppErr } = await supabase
    .from("opportunities")
    .select(
      `id, stage, ask_amount, expected_close, next_step, next_step_due, capacity_rating, updated_at,
       constituent:constituents ( id, type, first_name, last_name, org_name )`
    )
    .in("stage", OPEN_STAGE_LIST)
    .or(EXCLUDE_PARTNERSHIP_OPPS)
    .limit(150);
  if (oppErr) {
    return NextResponse.json({ error: "Could not load opportunities" }, { status: 500 });
  }
  const opps = (oppData ?? []) as unknown as OppRow[];
  if (opps.length === 0) {
    return NextResponse.json({ recommendations: [], stats: await fetchStats(supabase) });
  }

  const constituentIds = Array.from(
    new Set(opps.map((o) => o.constituent?.id).filter((id): id is string => !!id))
  );

  const [giftsRes, interRes] = await Promise.all([
    constituentIds.length
      ? supabase.from("gifts").select("constituent_id, amount, gift_date").in("constituent_id", constituentIds).limit(8000)
      : Promise.resolve({ data: [] as { constituent_id: string | null; amount: number; gift_date: string }[] }),
    constituentIds.length
      ? supabase
          .from("interactions")
          .select("constituent_id, kind, occurred_at, direction")
          .in("constituent_id", constituentIds)
          .order("occurred_at", { ascending: false })
          .limit(4000)
      : Promise.resolve({ data: [] as { constituent_id: string | null; kind: string; occurred_at: string; direction: string | null }[] }),
  ]);

  const giving = new Map<string, { total: number; count: number; last: string | null }>();
  for (const g of (giftsRes.data ?? []) as { constituent_id: string | null; amount: number; gift_date: string }[]) {
    if (!g.constituent_id) continue;
    const r = giving.get(g.constituent_id) ?? { total: 0, count: 0, last: null };
    r.total += Number(g.amount);
    r.count += 1;
    if (!r.last || g.gift_date > r.last) r.last = g.gift_date;
    giving.set(g.constituent_id, r);
  }

  const touch = new Map<string, { kind: string; at: string; recentInbound: boolean }>();
  const cutoff = Date.parse(today + "T00:00:00") - 14 * DAY;
  for (const i of (interRes.data ?? []) as { constituent_id: string | null; kind: string; occurred_at: string; direction: string | null }[]) {
    if (!i.constituent_id) continue;
    const prev = touch.get(i.constituent_id);
    const recentInbound =
      (prev?.recentInbound ?? false) || (i.direction === "inbound" && Date.parse(i.occurred_at) >= cutoff);
    if (!prev) touch.set(i.constituent_id, { kind: i.kind, at: i.occurred_at, recentInbound });
    else if (recentInbound !== prev.recentInbound) touch.set(i.constituent_id, { ...prev, recentInbound });
  }

  const candidates: NbaCandidate[] = opps.map((o) => {
    const cid = o.constituent?.id ?? null;
    const gv = cid ? giving.get(cid) : undefined;
    const tc = cid ? touch.get(cid) : undefined;
    return {
      opportunity_id: o.id,
      constituent_name: o.constituent ? constituentName(o.constituent) : "Unknown",
      stage: o.stage,
      days_in_stage: daysSince(o.updated_at),
      ask_amount: o.ask_amount,
      expected_close: o.expected_close,
      current_next_step: o.next_step,
      next_step_due: o.next_step_due,
      overdue: !!o.next_step_due && o.next_step_due < today,
      lifetime_giving: gv?.total ?? 0,
      gift_count: gv?.count ?? 0,
      last_gift_date: gv?.last ?? null,
      last_touch_kind: tc?.kind ?? null,
      last_touch_date: tc?.at ?? null,
      days_since_touch: tc ? daysSince(tc.at) : null,
      recent_inbound_email: tc?.recentInbound ?? false,
      capacity_rating: o.capacity_rating,
    };
  });

  candidates.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const at = a.days_since_touch ?? 9999;
    const bt = b.days_since_touch ?? 9999;
    if (at !== bt) return bt - at;
    return (b.ask_amount ?? 0) - (a.ask_amount ?? 0);
  });
  const shortlist = candidates.slice(0, MAX_CANDIDATES);
  const byId = new Map(opps.map((o) => [o.id, o]));

  let result;
  try {
    result = await runNextBestAction(shortlist, today);
  } catch (e) {
    console.error("NBA agent error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Suggestion generation failed" }, { status: 502 });
  }
  const recs = result.recommendations;

  // Record spend on the shared agent wallet (drives the budget cap above).
  const costUsd = estimateNbaCostUsd(result.tokensInput, result.tokensOutput);
  await supabase.from("fr_agent_activity_log").insert({
    org_id: ctx.orgId,
    created_by: "agent",
    triggered_by: currentUser,
    action_type: "other",
    prompt_summary: `Next-best-action over ${shortlist.length} open opportunities`,
    model_used: result.model,
    tokens_input: result.tokensInput,
    tokens_output: result.tokensOutput,
    status: "success",
    metadata: { kind: "next_best_action", estimated_cost_usd: Number(costUsd.toFixed(4)), suggestions: recs.length },
  });

  // Mirror into the unified AI ledger (additive; fr_agent_activity_log above
  // stays the agent-wallet cap source). Runs for every call, including the
  // zero-recommendation path below. Reuses ctx resolved in the pre-flight cap check.
  {
    await logAICall(supabase, {
      orgId: ctx.orgId,
      surface: "next_best_action",
      model: result.model,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
      costUsd,
      triggeredBy: currentUser,
      status: "success",
      metadata: { suggestions: recs.length },
    });
  }

  if (recs.length === 0) {
    return NextResponse.json({ recommendations: [], stats: await fetchStats(supabase), budgetWarning });
  }

  // Persist: supersede prior open suggestions for these opportunities, then
  // insert the fresh batch.
  const batchId = randomUUID();
  const oppIds = recs.map((r) => r.opportunity_id);
  await supabase
    .from("fr_nba_suggestions")
    .update({ status: "superseded" })
    .eq("status", "suggested")
    .in("opportunity_id", oppIds);

  const rows = recs.map((r) => {
    const due = new Date(Date.now() + r.suggested_due_in_days * DAY).toISOString().slice(0, 10);
    return {
      org_id: ctx.orgId,
      opportunity_id: r.opportunity_id,
      constituent_id: byId.get(r.opportunity_id)?.constituent?.id ?? null,
      batch_id: batchId,
      priority: r.priority,
      action: r.action,
      rationale: r.rationale,
      channel: r.channel,
      suggested_due: due,
      status: "suggested" as const,
    };
  });
  const { data: inserted, error: insErr } = await supabase
    .from("fr_nba_suggestions")
    .insert(rows)
    .select("id, opportunity_id, suggested_due");
  if (insErr) {
    console.error("NBA persist error:", insErr.message);
    return NextResponse.json({ error: "Could not save suggestions" }, { status: 500 });
  }
  const idByOpp = new Map((inserted ?? []).map((r) => [r.opportunity_id as string, r as { id: string; suggested_due: string }]));

  const cards: NbaCardRecommendation[] = recs.map((r) => {
    const o = byId.get(r.opportunity_id);
    const ins = idByOpp.get(r.opportunity_id);
    return {
      ...r,
      id: ins?.id ?? "",
      constituent_id: o?.constituent?.id ?? null,
      constituent_name: o?.constituent ? constituentName(o.constituent) : "Unknown",
      stage: o?.stage ?? "",
      ask_amount: o?.ask_amount ?? null,
      next_step_due: ins?.suggested_due ?? today,
    };
  });

  return NextResponse.json({ recommendations: cards, stats: await fetchStats(supabase), budgetWarning });
}
