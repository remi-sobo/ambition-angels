/**
 * Executive Briefing v2 — Phase 3: today's fundraising priorities.
 *
 * Reads the top AI-prioritized moves from the persisted next-best-action
 * suggestions (fr_nba_suggestions — generated from the Fundraising page, joined
 * live so names/asks stay fresh and applied/dropped ones fall away). When fewer
 * than `limit` exist, it fills from the deterministic queue (overdue next steps,
 * then asks closing soon) so the section is always useful — exactly the
 * "AI top 3, deterministic fallback" the spec calls for. Read-only; acting on a
 * move happens on the Fundraising page.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { constituentName } from "@/lib/fundraising/display";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { OPEN_STAGE_LIST } from "@/lib/fundraising/stage-sets";

const DAY = 86_400_000;

export type FundraisingMove = {
  id: string;
  opportunityId: string;
  constituentId: string | null;
  name: string;
  stage: string;
  askAmount: number | null;
  action: string;
  rationale: string;
  channel: string;
  dueDate: string | null;
  /** Whether the move came from the AI agent or the deterministic queue. */
  source: "ai" | "auto";
};

type ConstituentLite = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
} | null;

const isoDate = (now: number) => new Date(now).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

// AI-prioritized moves from the persisted suggestions, joined live to their
// opportunity + constituent (mirrors the Fundraising page's read).
async function readAiMoves(sb: SupabaseClient, limit: number): Promise<FundraisingMove[]> {
  const { data } = await sb
    .from("fr_nba_suggestions")
    .select(
      `id, opportunity_id, priority, action, rationale, channel, suggested_due,
       opportunity:opportunities ( id, stage, ask_amount,
         constituent:constituents ( id, type, first_name, last_name, org_name ) )`
    )
    .eq("status", "suggested")
    .order("priority", { ascending: true })
    .limit(limit);

  type Row = {
    id: string;
    opportunity_id: string;
    priority: number | null;
    action: string;
    rationale: string | null;
    channel: string | null;
    suggested_due: string | null;
    opportunity: { id: string; stage: string; ask_amount: number | null; constituent: ConstituentLite } | null;
  };

  const out: FundraisingMove[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.opportunity) continue; // opportunity gone
    out.push({
      id: r.id,
      opportunityId: r.opportunity_id,
      constituentId: r.opportunity.constituent?.id ?? null,
      name: r.opportunity.constituent ? constituentName(r.opportunity.constituent) : "Unknown",
      stage: r.opportunity.stage,
      askAmount: r.opportunity.ask_amount,
      action: r.action,
      rationale: r.rationale ?? "",
      channel: r.channel ?? "other",
      dueDate: r.suggested_due,
      source: "ai",
    });
  }
  return out;
}

// Deterministic fill: overdue next steps first, then asks closing within 30 days
// — excluding opportunities the AI already covered.
async function readAutoMoves(
  sb: SupabaseClient,
  now: number,
  limit: number,
  excludeOppIds: Set<string>
): Promise<FundraisingMove[]> {
  if (limit <= 0) return [];
  const today = isoDate(now);
  const soon = addDays(today, 30);
  const sel =
    "id, stage, ask_amount, next_step, next_step_due, expected_close, " +
    "constituent:constituents ( id, type, first_name, last_name, org_name )";

  const [overdueRes, closingRes] = await Promise.all([
    sb
      .from("opportunities")
      .select(sel)
      .in("stage", OPEN_STAGE_LIST)
      .or(EXCLUDE_PARTNERSHIP_OPPS)
      .not("next_step", "is", null)
      .lt("next_step_due", today)
      .order("next_step_due", { ascending: true })
      .limit(20),
    sb
      .from("opportunities")
      .select(sel)
      .in("stage", OPEN_STAGE_LIST)
      .or(EXCLUDE_PARTNERSHIP_OPPS)
      .gte("expected_close", today)
      .lte("expected_close", soon)
      .order("expected_close", { ascending: true })
      .limit(20),
  ]);

  type OppRow = {
    id: string;
    stage: string;
    ask_amount: number | null;
    next_step: string | null;
    next_step_due: string | null;
    expected_close: string | null;
    constituent: ConstituentLite;
  };

  const seen = new Set(excludeOppIds);
  const out: FundraisingMove[] = [];

  const push = (o: OppRow, action: string, rationale: string, dueDate: string | null) => {
    if (seen.has(o.id) || out.length >= limit) return;
    seen.add(o.id);
    out.push({
      id: `auto:${o.id}`,
      opportunityId: o.id,
      constituentId: o.constituent?.id ?? null,
      name: o.constituent ? constituentName(o.constituent) : "Unknown",
      stage: o.stage,
      askAmount: o.ask_amount,
      action,
      rationale,
      channel: "other",
      dueDate,
      source: "auto",
    });
  };

  for (const o of (overdueRes.data ?? []) as unknown as OppRow[]) {
    push(o, o.next_step ?? "Follow up on this ask", `Next step was due ${o.next_step_due ? fmtDate(o.next_step_due) : "earlier"}`, o.next_step_due);
  }
  for (const o of (closingRes.data ?? []) as unknown as OppRow[]) {
    push(o, "Advance this ask toward close", `Expected to close ${o.expected_close ? fmtDate(o.expected_close) : "soon"}`, o.expected_close);
  }
  return out;
}

export async function getFundraisingPriorities(
  sb: SupabaseClient,
  now: number = Date.now(),
  limit = 3
): Promise<FundraisingMove[]> {
  const ai = await readAiMoves(sb, limit);
  if (ai.length >= limit) return ai.slice(0, limit);
  const auto = await readAutoMoves(sb, now, limit - ai.length, new Set(ai.map((m) => m.opportunityId)));
  return [...ai, ...auto];
}
