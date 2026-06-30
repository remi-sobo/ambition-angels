/**
 * Next-best-action agent call. Structured output via forced tool use: the
 * agent calls `submit_recommendations` with a typed array, so there's no
 * text-parsing step (same robustness approach as the funder-research agent).
 * No web search — it reasons only over the facts the route passes in.
 *
 * Never logs the API key or the system prompt.
 */
import Anthropic from "@anthropic-ai/sdk";
import NBA_SYSTEM_PROMPT from "./prompt";
import { cleanVoiceText } from "@/lib/ai/voice";
import type { NbaCandidate, NbaChannel, NbaRecommendation } from "./types";

export const NBA_MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 3000;
const CHANNELS: NbaChannel[] = ["email", "call", "meeting", "note", "other"];

const REC_INPUT_SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      description:
        "Prioritized next actions, highest priority first. Omit opportunities that need no move now.",
      items: {
        type: "object",
        properties: {
          opportunity_id: {
            type: "string",
            description: "The opportunity_id from the input. Must match exactly.",
          },
          priority: {
            type: "integer",
            description: "1 = do this first. Unique, ascending.",
          },
          action: {
            type: "string",
            description: "Concrete imperative action, <= 120 chars.",
          },
          rationale: {
            type: "string",
            description: "One line citing the specific facts that drive it, <= 160 chars.",
          },
          channel: {
            type: "string",
            enum: CHANNELS,
            description: "How to do it.",
          },
          suggested_due_in_days: {
            type: "integer",
            description: "Days from today the step is due, 0–30.",
          },
        },
        required: ["opportunity_id", "priority", "action", "rationale", "channel", "suggested_due_in_days"],
      },
    },
  },
  required: ["recommendations"],
} as const;

function formatCandidates(candidates: NbaCandidate[], today: string): string {
  const lines: string[] = [];
  lines.push(`Today is ${today}. Here are the open opportunities to triage:`);
  lines.push("");
  for (const c of candidates) {
    lines.push(`### ${c.constituent_name} — opportunity_id: ${c.opportunity_id}`);
    lines.push(
      `- Stage: ${c.stage}${c.days_in_stage !== null ? ` (${c.days_in_stage} days in stage)` : ""}`
    );
    lines.push(
      `- Ask: ${c.ask_amount !== null ? `$${c.ask_amount.toLocaleString()}` : "none set"}` +
        `${c.expected_close ? ` · expected close ${c.expected_close}` : ""}` +
        `${c.capacity_rating !== null ? ` · capacity ${c.capacity_rating}/5` : ""}`
    );
    lines.push(
      `- Current next step: ${
        c.current_next_step
          ? `"${c.current_next_step}"${c.next_step_due ? ` due ${c.next_step_due}` : ""}${
              c.overdue ? " (OVERDUE)" : ""
            }`
          : "none set"
      }`
    );
    lines.push(
      `- Giving: $${c.lifetime_giving.toLocaleString()} lifetime over ${c.gift_count} gift(s)` +
        `${c.last_gift_date ? ` · last gift ${c.last_gift_date}` : " · no gifts yet"}`
    );
    lines.push(
      `- Last touch: ${
        c.last_touch_kind && c.last_touch_date
          ? `${c.last_touch_kind} on ${c.last_touch_date}` +
            `${c.days_since_touch !== null ? ` (${c.days_since_touch} days ago)` : ""}`
          : "none on record"
      }${c.recent_inbound_email ? " · they emailed in within the last 14 days" : ""}`
    );
    lines.push("");
  }
  lines.push("Call submit_recommendations with your prioritized list.");
  return lines.join("\n");
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * Coerce the model's submit_recommendations tool input into safe, typed rows.
 * Pure and offline-testable (no key, no network): drops any opportunity_id not
 * in validIds (hallucinated rows), forces a known channel, clamps priority and
 * due-in-days, truncates free text, and sorts by priority. Exported so the eval
 * suite can golden-test the safety properties directly.
 */
export function parseRecommendations(rawInput: unknown, validIds: Set<string>): NbaRecommendation[] {
  const raw = (rawInput as { recommendations?: unknown } | null)?.recommendations;
  if (!Array.isArray(raw)) return [];

  const out: NbaRecommendation[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const id = typeof r.opportunity_id === "string" ? r.opportunity_id : "";
    if (!validIds.has(id)) continue; // drop any hallucinated id
    const channel = CHANNELS.includes(r.channel as NbaChannel) ? (r.channel as NbaChannel) : "other";
    out.push({
      opportunity_id: id,
      priority: typeof r.priority === "number" ? clamp(r.priority, 1, 999) : 999,
      action: cleanVoiceText(String(r.action ?? "").trim()).slice(0, 200),
      rationale: cleanVoiceText(String(r.rationale ?? "").trim()).slice(0, 240),
      channel,
      suggested_due_in_days:
        typeof r.suggested_due_in_days === "number" ? clamp(r.suggested_due_in_days, 0, 30) : 3,
    });
  }
  out.sort((a, b) => a.priority - b.priority);
  return out;
}

export type NbaResult = {
  recommendations: NbaRecommendation[];
  tokensInput: number;
  tokensOutput: number;
  model: string;
};

export async function runNextBestAction(
  candidates: NbaCandidate[],
  today: string
): Promise<NbaResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("NBA agent: ANTHROPIC_API_KEY must be set");
  if (candidates.length === 0) return { recommendations: [], tokensInput: 0, tokensOutput: 0, model: NBA_MODEL };

  const client = new Anthropic({ apiKey: key });
  const validIds = new Set(candidates.map((c) => c.opportunity_id));

  const response = await client.messages.create({
    model: NBA_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: "text", text: NBA_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: formatCandidates(candidates, today) }],
    // Force the structured tool call so output is never free text.
    tools: [
      {
        name: "submit_recommendations",
        description: "Submit the prioritized next-action list. Call exactly once.",
        input_schema: REC_INPUT_SCHEMA,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
    tool_choice: { type: "tool", name: "submit_recommendations" },
  });

  const u = response.usage;
  const tokensInput =
    (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const tokensOutput = u.output_tokens ?? 0;
  const model = response.model ?? NBA_MODEL;
  const empty = { recommendations: [] as NbaRecommendation[], tokensInput, tokensOutput, model };

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === "tool_use" && b.name === "submit_recommendations"
  );
  if (!toolUse) return empty;

  const recommendations = parseRecommendations(toolUse.input, validIds);
  return { recommendations, tokensInput, tokensOutput, model };
}

// Sonnet rough rates per million tokens (matches the model used above).
export const NBA_INPUT_PER_MILLION_USD = 3;
export const NBA_OUTPUT_PER_MILLION_USD = 15;
export function estimateNbaCostUsd(tokensInput: number, tokensOutput: number): number {
  return (tokensInput * NBA_INPUT_PER_MILLION_USD + tokensOutput * NBA_OUTPUT_PER_MILLION_USD) / 1_000_000;
}
