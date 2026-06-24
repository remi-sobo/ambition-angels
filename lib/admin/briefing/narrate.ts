/**
 * Executive Briefing v2 — the AI morning narrative.
 *
 * Design principle: DETERMINISTIC SELECTION, AI NARRATION. The engine decides
 * what matters and computes every number; Claude only phrases those facts. The
 * model is told, and structurally constrained, to never introduce a number or
 * name not in its input — so the prose is delightful but the figures stay
 * auditable. No hallucinated runway, ever.
 *
 * Cost: one cached row per day (bloomos_briefing_narrative). The cron pre-warms
 * it at ~6am; the first page visit generates it if the cron didn't run; a
 * manual "Regenerate" forces a fresh read. ~1 Sonnet call/day ≈ pennies/month.
 */
import "server-only";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Briefing } from "./engine";
import type { Pulse } from "./pulse";

export const BRIEFING_MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 700;

export type Narrative = {
  headline: string;
  narrative: string;
  focus: string | null;
  /** Derived deterministically from the current top item — never from the model. */
  focusLink: string | null;
  model: string;
  /** ISO timestamp the narrative was generated. */
  generatedAt: string;
  /** Whether the prose came from Claude or the deterministic fallback. */
  source: "ai" | "fallback";
};

const isoDate = (now: number) => new Date(now).toISOString().slice(0, 10);

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** The compact, rounded fact sheet the model narrates — and the basis of the
 *  cache key. Rounding keeps the hash from churning on sub-dollar drift. */
function factSheet(briefing: Briefing, pulse: Pulse, today: string) {
  const counts = { critical: 0, watch: 0, due_soon: 0 };
  for (const it of briefing.items) counts[it.severity]++;
  return {
    date: today,
    pulse: {
      runwayMonths: pulse.runwayMonths == null ? null : Math.round(pulse.runwayMonths * 10) / 10,
      cashOnHand: Math.round(pulse.cashOnHand),
      openPipelineUsd: Math.round(pulse.openPipelineUsd),
      openAskCount: pulse.openAskCount,
      raisedYtd: Math.round(pulse.raisedYtd),
      goal: Math.round(pulse.goal),
      pctToGoal: pulse.pctToGoal == null ? null : Math.round(pulse.pctToGoal),
    },
    counts,
    total: briefing.items.length,
    topItems: briefing.top.map((it) => ({
      severity: it.severity,
      source: it.source,
      title: it.title,
      detail: it.detail,
      metric: it.metric ?? null,
    })),
  };
}

type FactSheet = ReturnType<typeof factSheet>;

const SYSTEM_PROMPT = `You are the chief of staff to the CEO of Ambition Angels, a fast-growing nonprofit that builds future-orientation in under-resourced teens. Every morning you hand the CEO a short, sharp brief.

Voice: warm but direct, executive, confident — a trusted, McKinsey-trained chief of staff. Plain English. No hype, no filler, no emoji, no exclamation marks.

HARD RULES:
- Use ONLY the facts in the data provided. NEVER invent, infer, or alter a number, name, dollar amount, percentage, or date. If you're unsure, leave it out.
- If there are no items needing a decision, say plainly that the morning is clear and name one healthy signal from the pulse.
- The narrative is 2–4 sentences, at most 110 words. Lead with the single most important thing.
- "focus" is one imperative sentence: the one thing to do first today, drawn from the top item. If nothing needs action, set focus to a short steady-state note.

Call submit_briefing exactly once.`;

const SUBMIT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "A 4–9 word headline for the morning. <= 90 chars." },
    narrative: {
      type: "string",
      description: "The 2–4 sentence brief. <= 110 words. Only facts from the data.",
    },
    focus: {
      type: "string",
      description: "One imperative sentence — the single thing to do first today. <= 140 chars.",
    },
  },
  required: ["headline", "narrative", "focus"],
} as const;

function renderFactsForModel(fs: FactSheet): string {
  const p = fs.pulse;
  const lines: string[] = [];
  lines.push(`Date: ${fs.date}`);
  lines.push("");
  lines.push("PULSE (organizational vital signs):");
  lines.push(`- Runway: ${p.runwayMonths == null ? "not computable" : `${p.runwayMonths} months`} at current burn`);
  lines.push(`- Cash on hand: ${usd(p.cashOnHand)}`);
  lines.push(`- Open fundraising pipeline: ${usd(p.openPipelineUsd)} across ${p.openAskCount} open asks`);
  lines.push(
    `- Raised year-to-date: ${usd(p.raisedYtd)}${
      p.goal > 0 ? ` of a ${usd(p.goal)} goal (${p.pctToGoal}%)` : " (no goal set)"
    }`
  );
  lines.push("");
  if (fs.topItems.length === 0) {
    lines.push("ITEMS NEEDING A DECISION TODAY: none. The board is clear.");
  } else {
    lines.push(
      `ITEMS NEEDING A DECISION TODAY (${fs.total} total — ${fs.counts.critical} critical, ${fs.counts.watch} watch, ${fs.counts.due_soon} due soon). Top items, most important first:`
    );
    fs.topItems.forEach((it, i) => {
      lines.push(`${i + 1}. [${it.severity}] ${it.title} — ${it.detail}${it.metric ? ` (${it.metric})` : ""}`);
    });
  }
  lines.push("");
  lines.push("Write the morning brief. Call submit_briefing.");
  return lines.join("\n");
}

const topLink = (briefing: Briefing): string | null => briefing.top[0]?.deepLink ?? null;

// ── Deterministic fallback (no API key, or the model call failed) ─────────────
// Same shape, plainer prose, built only from the facts. Never stored, so the
// next visit retries the AI path.
function fallbackNarrative(briefing: Briefing, pulse: Pulse, now: number): Narrative {
  const top = briefing.top;
  let headline: string;
  let narrative: string;
  let focus: string | null;

  if (top.length === 0) {
    headline = "You're clear this morning";
    narrative =
      pulse.runwayMonths != null
        ? `Nothing needs a decision today. Runway sits at ${pulse.runwayMonths.toFixed(1)} months with ${usd(pulse.cashOnHand)} on hand, and ${usd(pulse.openPipelineUsd)} is in the open pipeline.`
        : `Nothing needs a decision today. ${usd(pulse.cashOnHand)} is on hand and ${usd(pulse.openPipelineUsd)} is in the open pipeline.`;
    focus = "No actions queued — use the open time to get ahead on outreach.";
  } else {
    const counts = { critical: 0, watch: 0, due_soon: 0 };
    for (const it of briefing.items) counts[it.severity]++;
    const parts = [
      counts.critical ? `${counts.critical} critical` : "",
      counts.watch ? `${counts.watch} to watch` : "",
      counts.due_soon ? `${counts.due_soon} due soon` : "",
    ].filter(Boolean);
    headline =
      counts.critical > 0
        ? `${counts.critical} thing${counts.critical === 1 ? "" : "s"} need${counts.critical === 1 ? "s" : ""} you now`
        : `${briefing.items.length} item${briefing.items.length === 1 ? "" : "s"} for your morning`;
    narrative = `${parts.join(", ")}. Top of the list: ${top[0].title} — ${top[0].detail}`;
    focus = top[0].title;
  }

  return {
    headline,
    narrative,
    focus,
    focusLink: topLink(briefing),
    model: "deterministic-fallback",
    generatedAt: new Date(now).toISOString(),
    source: "fallback",
  };
}

// ── The Sonnet call ──────────────────────────────────────────────────────────
async function callModel(fs: FactSheet): Promise<{ headline: string; narrative: string; focus: string; model: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const client = new Anthropic({ apiKey: key });

  const response = await client.messages.create({
    model: BRIEFING_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: renderFactsForModel(fs) }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ name: "submit_briefing", description: "Submit the morning brief. Call exactly once.", input_schema: SUBMIT_SCHEMA } as any],
    tool_choice: { type: "tool", name: "submit_briefing" },
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === "submit_briefing"
  );
  if (!toolUse) return null;
  const input = toolUse.input as { headline?: unknown; narrative?: unknown; focus?: unknown };
  const headline = String(input.headline ?? "").trim().slice(0, 120);
  const narrative = String(input.narrative ?? "").trim().slice(0, 900);
  const focus = String(input.focus ?? "").trim().slice(0, 180);
  if (!headline || !narrative) return null;
  return { headline, narrative, focus, model: response.model ?? BRIEFING_MODEL };
}

function rowToNarrative(
  row: { headline: string; narrative: string; focus: string | null; model: string; generated_at: string },
  briefing: Briefing
): Narrative {
  return {
    headline: row.headline,
    narrative: row.narrative,
    focus: row.focus,
    focusLink: topLink(briefing),
    model: row.model,
    generatedAt: row.generated_at,
    source: "ai",
  };
}

/** Force a fresh generation and store it (cron pre-warm + manual regenerate). */
export async function generateNarrativeNow(
  briefing: Briefing,
  pulse: Pulse,
  now: number = Date.now(),
  sb: SupabaseClient = getSupabaseAdmin()
): Promise<Narrative> {
  const today = isoDate(now);
  const fs = factSheet(briefing, pulse, today);
  let ai: Awaited<ReturnType<typeof callModel>> = null;
  try {
    ai = await callModel(fs);
  } catch (e) {
    console.error("[briefing] narrative generation failed:", e);
  }
  if (!ai) return fallbackNarrative(briefing, pulse, now);

  const generatedAt = new Date(now).toISOString();
  const input_hash = createHash("sha1").update(JSON.stringify(fs)).digest("hex");
  await sb
    .from("bloomos_briefing_narrative")
    .upsert(
      {
        brief_date: today,
        headline: ai.headline,
        narrative: ai.narrative,
        focus: ai.focus,
        input_hash,
        model: ai.model,
        generated_at: generatedAt,
      },
      { onConflict: "brief_date" }
    )
    .then(({ error }) => {
      if (error) console.error("[briefing] narrative upsert failed:", error.message);
    });

  return { headline: ai.headline, narrative: ai.narrative, focus: ai.focus, focusLink: topLink(briefing), model: ai.model, generatedAt, source: "ai" };
}

/** Read today's cached narrative, generating + storing it on a miss (first
 *  visit of the day if the cron didn't run). Used by the page render. */
export async function getNarrative(
  briefing: Briefing,
  pulse: Pulse,
  now: number = Date.now()
): Promise<Narrative> {
  const sb = getSupabaseAdmin();
  const today = isoDate(now);
  try {
    const { data } = await sb
      .from("bloomos_briefing_narrative")
      .select("headline, narrative, focus, model, generated_at")
      .eq("brief_date", today)
      .maybeSingle();
    if (data) return rowToNarrative(data, briefing);
  } catch (e) {
    console.error("[briefing] narrative read failed:", e);
  }
  return generateNarrativeNow(briefing, pulse, now, sb);
}

/** Cron entry point: gather the spine and force a fresh morning narrative so the
 *  first open of the day is instant. Best-effort — never throws. */
export async function prewarmNarrative(now: number = Date.now()): Promise<void> {
  try {
    const { gatherBriefingView } = await import("./gather");
    const { briefing, pulse } = await gatherBriefingView(now);
    await generateNarrativeNow(briefing, pulse, now);
  } catch (e) {
    console.error("[briefing] narrative pre-warm failed:", e);
  }
}
