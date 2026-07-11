import Anthropic from "@anthropic-ai/sdk";
import { REED_ASK_MODEL } from "./cost";

/**
 * Reed's Ask runner (Phase 4): a bounded tool-use loop over Claude.
 *
 * The orchestrator hands in a system prompt, the running message list, and a
 * registry of READ-ONLY tools. Each tool's `run` closes over the SESSION
 * Supabase client, so every query Reed makes is RLS-scoped to the asking user —
 * the cardinal rule. This module never imports the service-role client and never
 * computes a number itself: numeric answers come back from tool results (real
 * query output), and Reed narrates them.
 */

let cached: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Reed: ANTHROPIC_API_KEY must be set");
  cached = new Anthropic({ apiKey: key });
  return cached;
}

export type ReedTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** Executes on the session client. Return a JSON-serializable result. */
  run: (input: Record<string, unknown>) => Promise<unknown>;
};

/**
 * A tool may return rich tool_result content (text + document blocks — how
 * read_document hands file bytes to the model) by wrapping the block array in
 * this marker shape. Everything else is JSON.stringify'd as before.
 */
export type ReedBlocksResult = { __reedBlocks: unknown[] };

export function toToolResultContent(out: unknown): string | unknown[] {
  if (
    out !== null &&
    typeof out === "object" &&
    Array.isArray((out as Partial<ReedBlocksResult>).__reedBlocks)
  ) {
    return (out as ReedBlocksResult).__reedBlocks;
  }
  return JSON.stringify(out);
}

export type ReedRunResult = {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  model: string;
  toolCalls: { name: string; ok: boolean }[];
  status: "success" | "partial";
};

const MAX_TURNS = 6;
const MAX_OUTPUT_TOKENS = 1024;

export async function runReedAsk(opts: {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: ReedTool[];
}): Promise<ReedRunResult> {
  const client = getAnthropic();
  const toolDefs = opts.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const messages: Anthropic.MessageParam[] = [...opts.messages];

  let tokensInput = 0;
  let tokensOutput = 0;
  let model = REED_ASK_MODEL;
  const toolCalls: { name: string; ok: boolean }[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const resp = await client.messages.create({
      model: REED_ASK_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages,
      tools: toolDefs as unknown as Anthropic.Tool[],
    });

    const u = resp.usage;
    tokensInput +=
      (u.input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0);
    tokensOutput += u.output_tokens ?? 0;
    model = resp.model ?? model;
    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason !== "tool_use") {
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text, tokensInput, tokensOutput, model, toolCalls, status: "success" };
    }

    // Execute every tool the model asked for, on the session client.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      const tool = byName.get(block.name);
      let ok = true;
      let result: string | unknown[];
      if (!tool) {
        ok = false;
        result = JSON.stringify({ error: `unknown tool: ${block.name}` });
      } else {
        try {
          const out = await tool.run((block.input ?? {}) as Record<string, unknown>);
          result = toToolResultContent(out);
        } catch (e) {
          ok = false;
          result = JSON.stringify({ error: e instanceof Error ? e.message : "tool failed" });
        }
      }
      toolCalls.push({ name: block.name, ok });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result as Anthropic.ToolResultBlockParam["content"],
        is_error: !ok,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Hit the turn ceiling without a final answer.
  return {
    text: "I couldn't finish working through that — try narrowing the question.",
    tokensInput,
    tokensOutput,
    model,
    toolCalls,
    status: "partial",
  };
}
