/**
 * POST /api/admin/fundraising/next-best-action — the NBA agent (Phase 2).
 *
 * Gathers the open moves-pipeline opportunities with real giving + engagement
 * facts, asks the agent to rank them and propose the single best next action
 * for each, and returns the recommendations enriched for the UI. Read-only:
 * nothing is written. The operator approves a card to Apply it (which PATCHes
 * the opportunity's next_step / next_step_due via the existing route).
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";
import { todayISO } from "@/app/admin/ops/_types/ops";
import { runNextBestAction } from "@/lib/agents/next-best-action/agent";
import type { NbaCandidate, NbaCardRecommendation } from "@/lib/agents/next-best-action/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OPEN_STAGES = ["identify", "qualify", "cultivate", "solicit"];
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

export async function POST() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 503 });
  }

  const supabase = createServerSupabase();
  const today = todayISO();

  const { data: oppData, error: oppErr } = await supabase
    .from("opportunities")
    .select(
      `id, stage, ask_amount, expected_close, next_step, next_step_due, capacity_rating, updated_at,
       constituent:constituents ( id, type, first_name, last_name, org_name )`
    )
    .in("stage", OPEN_STAGES)
    .limit(150);
  if (oppErr) {
    return NextResponse.json({ error: "Could not load opportunities" }, { status: 500 });
  }
  const opps = (oppData ?? []) as unknown as OppRow[];
  if (opps.length === 0) return NextResponse.json({ recommendations: [] });

  const constituentIds = Array.from(
    new Set(opps.map((o) => o.constituent?.id).filter((id): id is string => !!id))
  );

  // Giving rollups + interaction history for those constituents, in two reads.
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
  const cutoff = today.length === 10 ? Date.parse(today + "T00:00:00") - 14 * DAY : Date.now() - 14 * DAY;
  for (const i of (interRes.data ?? []) as { constituent_id: string | null; kind: string; occurred_at: string; direction: string | null }[]) {
    if (!i.constituent_id) continue;
    const prev = touch.get(i.constituent_id);
    const recentInbound =
      (prev?.recentInbound ?? false) || (i.direction === "inbound" && Date.parse(i.occurred_at) >= cutoff);
    // Rows arrive newest-first, so the first one we see per constituent is the latest touch.
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

  // Triage to the most pressing before spending tokens: overdue, then most
  // stale, then biggest ask.
  candidates.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const at = a.days_since_touch ?? 9999;
    const bt = b.days_since_touch ?? 9999;
    if (at !== bt) return bt - at;
    return (b.ask_amount ?? 0) - (a.ask_amount ?? 0);
  });
  const shortlist = candidates.slice(0, MAX_CANDIDATES);
  const byId = new Map(opps.map((o) => [o.id, o]));

  let recs;
  try {
    recs = await runNextBestAction(shortlist, today);
  } catch (e) {
    console.error("NBA agent error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Suggestion generation failed" }, { status: 502 });
  }

  const cards: NbaCardRecommendation[] = recs.map((r) => {
    const o = byId.get(r.opportunity_id);
    const due = new Date(Date.now() + r.suggested_due_in_days * DAY).toISOString().slice(0, 10);
    return {
      ...r,
      constituent_id: o?.constituent?.id ?? null,
      constituent_name: o?.constituent ? constituentName(o.constituent) : "Unknown",
      stage: o?.stage ?? "",
      ask_amount: o?.ask_amount ?? null,
      next_step_due: due,
    };
  });

  return NextResponse.json({ recommendations: cards });
}
