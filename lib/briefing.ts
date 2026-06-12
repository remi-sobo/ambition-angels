import type { SupabaseClient } from "@supabase/supabase-js";
import { computeKpis, formatKpi, type KpiValue } from "@/lib/kpis";

/**
 * The AI Executive Briefing (modules/01-command-center.md).
 *
 * Discipline: every number is computed by SQL (the metric registry + the
 * same queries the Monday digest uses). The model receives ONLY those
 * numbers and narrates — it never invents data, and a failed model call
 * degrades gracefully to the data-only briefing.
 */

export type BriefingData = {
  week: { gifts: number; giftTotal: number; newConstituents: number; pipelineMoves: number };
  todos: { pendingAcks: number; overdueMoves: number; complianceOverdue: number };
  deadlines: Array<{ what: string; due: string }>;
  kpis: Array<{ label: string; value: string }>;
};

export type BriefingResult = {
  headline: string | null;
  narrative: string | null;
  priorities: string[];
  data: BriefingData;
  model: string | null;
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const daysAhead = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function gatherBriefingData(supabase: SupabaseClient): Promise<BriefingData> {
  const weekAgo = daysAgo(7);
  const today = daysAgo(0);
  const horizon = daysAhead(14);
  const weekAgoTs = `${weekAgo}T00:00:00Z`;

  const [giftsRes, newConstRes, movesRes, acksRes, overdueMovesRes, compOverdueRes, grantDueRes, compDueRes, kpis] =
    await Promise.all([
      supabase.from("gifts").select("amount").gte("gift_date", weekAgo).limit(5000),
      supabase.from("constituents").select("id", { count: "exact", head: true }).gte("created_at", weekAgoTs),
      supabase.from("audit_log").select("id", { count: "exact", head: true })
        .eq("action", "fundraising.opportunity.stage").gte("ts", weekAgoTs),
      supabase.from("gifts").select("id", { count: "exact", head: true })
        .eq("acknowledgment_status", "pending"),
      supabase.from("opportunities").select("id", { count: "exact", head: true })
        .lt("next_step_due", today).not("next_step_due", "is", null)
        .not("stage", "in", "(steward,lost)"),
      supabase.from("compliance_items").select("id", { count: "exact", head: true })
        .in("status", ["upcoming", "in_progress"]).lt("due_date", today),
      supabase.from("grant_requirements").select("kind, label, due_date, grant:grants(name)")
        .in("status", ["upcoming", "in_progress"]).gte("due_date", today)
        .lte("due_date", horizon).order("due_date").limit(8),
      supabase.from("compliance_items").select("title, due_date")
        .in("status", ["upcoming", "in_progress"]).gte("due_date", today)
        .lte("due_date", horizon).order("due_date").limit(8),
      computeKpis(supabase),
    ]);

  const gifts = (giftsRes.data ?? []) as Array<{ amount: number }>;
  type Req = {
    kind: string; label: string | null; due_date: string;
    grant: { name: string } | { name: string }[] | null;
  };
  const grantName = (g: Req["grant"]) =>
    (Array.isArray(g) ? g[0]?.name : g?.name) ?? "Unknown grant";

  const deadlines = [
    ...((grantDueRes.data ?? []) as unknown as Req[]).map((r) => ({
      what: `${grantName(r.grant)} — ${r.label ?? r.kind.replace(/_/g, " ")}`,
      due: r.due_date,
    })),
    ...((compDueRes.data ?? []) as Array<{ title: string; due_date: string }>).map((c) => ({
      what: c.title,
      due: c.due_date,
    })),
  ].sort((a, b) => (a.due < b.due ? -1 : 1));

  return {
    week: {
      gifts: gifts.length,
      giftTotal: gifts.reduce((s, g) => s + Number(g.amount), 0),
      newConstituents: newConstRes.count ?? 0,
      pipelineMoves: movesRes.count ?? 0,
    },
    todos: {
      pendingAcks: acksRes.count ?? 0,
      overdueMoves: overdueMovesRes.count ?? 0,
      complianceOverdue: compOverdueRes.count ?? 0,
    },
    deadlines,
    kpis: (kpis as KpiValue[]).map((k) => ({ label: k.label, value: formatKpi(k, k.value) })),
  };
}

const MODEL = "claude-sonnet-4-6";

async function narrate(data: BriefingData): Promise<{
  headline: string | null; narrative: string | null; priorities: string[];
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { headline: null, narrative: null, priorities: [] };

  const prompt = [
    "You are BloomOS, the operating system for Ambition Angels — a small nonprofit helping high-school students find career paths. You write the executive briefing for the CEO (Remi) and his teammate (Shannon).",
    "",
    "Below is this week's operating data, computed from the live database. Use ONLY these numbers — never invent or extrapolate figures. Where a number is zero or data is thin, say so plainly; do not pad.",
    "",
    JSON.stringify(data, null, 2),
    "",
    "Write:",
    "1. headline — one warm, specific sentence (max 18 words) capturing the week.",
    "2. narrative — 80-140 words for a busy CEO: what happened, what it means, what deserves attention. Plain English, no jargon, no flattery. Reference specific numbers and deadlines from the data.",
    "3. priorities — exactly 3 short imperative recommendations (max 14 words each), the highest-leverage actions given this data.",
    "",
    'Return ONLY raw valid JSON: {"headline": string, "narrative": string, "priorities": [string, string, string]}. No markdown.',
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("Briefing narration failed:", res.status, await res.text());
      return { headline: null, narrative: null, priorities: [] };
    }
    const j = await res.json();
    const raw = (j.content?.[0]?.text ?? "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw) as {
      headline?: unknown; narrative?: unknown; priorities?: unknown;
    };
    return {
      headline: typeof parsed.headline === "string" ? parsed.headline.slice(0, 200) : null,
      narrative: typeof parsed.narrative === "string" ? parsed.narrative.slice(0, 2000) : null,
      priorities: Array.isArray(parsed.priorities)
        ? parsed.priorities.filter((p): p is string => typeof p === "string").slice(0, 3)
        : [],
    };
  } catch (e) {
    console.error("Briefing narration threw:", e);
    return { headline: null, narrative: null, priorities: [] };
  }
}

/** Gather → narrate → store. Never throws; narration failure = data-only row. */
export async function generateBriefing(
  supabase: SupabaseClient,
  kind: "weekly" | "on_demand"
): Promise<BriefingResult> {
  const data = await gatherBriefingData(supabase);
  const ai = await narrate(data);
  const result: BriefingResult = { ...ai, data, model: ai.narrative ? MODEL : null };

  const { error } = await supabase.from("briefings").insert({
    kind,
    headline: result.headline,
    narrative: result.narrative,
    priorities: result.priorities,
    data: result.data,
    model: result.model,
  });
  if (error) console.error("Store briefing failed:", error.message);
  return result;
}
