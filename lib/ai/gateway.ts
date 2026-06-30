/**
 * AI gateway — the single seam for plain text-in / text-out model calls.
 *
 * The playbook wants one chokepoint where model spend, caching, voice, and
 * degradation are handled once instead of at every call site. This is the first
 * slice of it: a `generateText` helper for the simple prose routes (career
 * matching, thank-you drafts, decision tools). The structured-output agents in
 * lib/agents/* keep their bespoke tool-calling loops for now and will adopt the
 * same seam incrementally.
 *
 * What it bakes in:
 * - one place to choose the model by task tier,
 * - prompt caching of the system prompt by default (ephemeral),
 * - an optional voice sweep on the returned text (default on; turn OFF for
 *   structured payloads where punctuation is load-bearing, e.g. salary ranges),
 * - usage returned so a future per-org cost ledger can read it.
 *
 * It does NOT swallow errors or invent fallbacks: callers keep their own
 * try/catch and their own HTTP status codes, so existing behavior is preserved.
 */

import Anthropic from "@anthropic-ai/sdk";
import { cleanVoiceText } from "./voice";
import { estimateCostUsd } from "./cost";

export type ModelTier = "fast" | "deep";

/**
 * Task tiers map to models in one place. `fast` is the conversational and
 * breadth default; `deep` is for research and judgment. Mirrors the per-agent
 * constants already in the codebase; override per call with `model` when needed.
 */
export const MODEL_BY_TIER: Record<ModelTier, string> = {
  fast: "claude-sonnet-4-6",
  deep: "claude-opus-4-8",
};

/** Thrown when the API key is absent, so callers can map it to their own status. */
export class AIKeyMissingError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not configured");
    this.name = "AIKeyMissingError";
  }
}

export type GenerateTextOptions = {
  /** The user prompt. */
  prompt: string;
  /** Optional system prompt; cached ephemerally when present. */
  system?: string;
  /** Task tier; ignored when an explicit `model` is given. Defaults to "fast". */
  tier?: ModelTier;
  /** Explicit model id; overrides `tier`. */
  model?: string;
  /** Output token ceiling. */
  maxTokens: number;
  /** Sweep the returned text through the shared voice repair. Defaults to true. */
  voice?: boolean;
};

export type AIUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

export type GenerateTextResult = {
  text: string;
  model: string;
  usage: AIUsage;
  /** Estimated USD cost from the shared price sheet, for the spend ledger. */
  costUsd: number;
};

/** Resolve the configured key, or throw a typed error the caller can map. */
function requireKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AIKeyMissingError();
  return key;
}

/**
 * Single text-in / text-out call. Concatenates all returned text blocks,
 * applies the voice sweep unless disabled, and returns usage.
 */
export async function generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
  const client = new Anthropic({ apiKey: requireKey() });
  const model = opts.model ?? MODEL_BY_TIER[opts.tier ?? "fast"];

  const resp = await client.messages.create({
    model,
    max_tokens: opts.maxTokens,
    ...(opts.system
      ? { system: [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }] }
      : {}),
    messages: [{ role: "user", content: opts.prompt }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const usage = resp.usage as Anthropic.Usage & {
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;

  return {
    text: opts.voice === false ? text : cleanVoiceText(text),
    model,
    usage: { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens },
    // Fold cache tokens into input, matching how the agents bill.
    costUsd: estimateCostUsd(model, inputTokens + cacheReadTokens + cacheCreationTokens, outputTokens),
  };
}

export type StructuredTool = {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  input_schema: unknown;
};

export type GenerateStructuredOptions = {
  system: string;
  prompt: string;
  tier?: ModelTier;
  model?: string;
  maxTokens: number;
  tool: StructuredTool;
};

export type GenerateStructuredResult = {
  /** The tool's input object, or null if the model did not call the tool. */
  input: unknown;
  model: string;
  usage: AIUsage;
  costUsd: number;
};

/**
 * Single forced-tool-call: caches the system prompt, forces the model to answer
 * by calling exactly the named tool (no free text), and returns its validated
 * input plus usage/cost. The caller coerces `input` with its own pure parser
 * (the parseRecommendations / parseCandidates helpers in lib/agents). Bespoke
 * multi-turn or web-search agents keep their own loops; this seam is for the
 * single-shot structured calls.
 */
export async function generateStructured(
  opts: GenerateStructuredOptions,
): Promise<GenerateStructuredResult> {
  const client = new Anthropic({ apiKey: requireKey() });
  const model = opts.model ?? MODEL_BY_TIER[opts.tier ?? "fast"];

  const resp = await client.messages.create({
    model,
    max_tokens: opts.maxTokens,
    system: [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user", content: opts.prompt }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ name: opts.tool.name, description: opts.tool.description, input_schema: opts.tool.input_schema }] as any,
    tool_choice: { type: "tool", name: opts.tool.name },
  });

  const toolUse = resp.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === opts.tool.name,
  );

  const usage = resp.usage as Anthropic.Usage & {
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
  const inputTokens =
    (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const outputTokens = usage.output_tokens ?? 0;
  const resolvedModel = resp.model ?? model;

  return {
    input: toolUse ? toolUse.input : null,
    model: resolvedModel,
    usage: {
      inputTokens,
      outputTokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    },
    costUsd: estimateCostUsd(resolvedModel, inputTokens, outputTokens),
  };
}
