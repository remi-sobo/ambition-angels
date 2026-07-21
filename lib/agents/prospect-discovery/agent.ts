/**
 * Prospect discovery agent. Given a fundraising strategy angle and a target
 * type, web-searches for NET-NEW prospects who plausibly fund this work and
 * likely haven't given yet, and returns a ranked candidate list (each with a
 * concrete fit rationale + sources). Structured output via a forced-ish
 * submit_candidates tool; web search is the built-in server tool.
 *
 * Sonnet (not Opus) — discovery is breadth over depth, and it's the cheaper
 * model for a tool that may run often. The deep per-prospect brief stays on the
 * research agent (Opus). Never logs the API key.
 */
import Anthropic from "@anthropic-ai/sdk";
import { cleanVoiceText } from "@/lib/ai/voice";
import type { AgentOrgProfile } from "@/lib/agents/org-profile";

export const DISCOVERY_MODEL = "claude-sonnet-4-6";
const MAX_WEB_SEARCHES = 8;
const MAX_OUTPUT_TOKENS = 4000;

export type DiscoveryType = "individual" | "foundation" | "corporate";

export type DiscoveryCandidate = {
  name: string;
  org: string | null;
  type: DiscoveryType;
  fit_rationale: string;
  signal: string | null;
  sources: string[];
};

export type DiscoveryResult = {
  candidates: DiscoveryCandidate[];
  model_used: string;
  tokens_input: number;
  tokens_output: number;
  web_search_count: number;
};

const TYPE_NOUN: Record<DiscoveryType, string> = {
  individual: "individual donors / philanthropists",
  foundation: "foundations / family funds",
  corporate: "companies / corporate giving programs",
};

// Kept byte-stable PER ORG so the ephemeral cache breakpoint hits across
// runs: the resident org keeps its hand-tuned prompt verbatim; other orgs get
// a neutral prompt in their own name that leans on the angle's thesis instead
// of the missing mission facts.
const RESIDENT_SYSTEM_PROMPT = `You are a major-gifts prospect researcher for Ambition Angels, a nonprofit that builds future-orientation and career readiness in under-resourced teens (87% Title I; demonstrated lift in students' future-orientation). You find net-new prospects worth cultivating.

Your job: given a funding ANGLE (a strategic thesis) and a TARGET TYPE, use web search to surface real, specific prospects who plausibly fund work like ours and are NOT obvious existing donors. Quality over quantity.

RULES:
- Return 5–8 candidates, ranked best-fit first. Fewer high-confidence beats many weak ones.
- Every candidate must be a REAL, named, verifiable entity you found via search — never invented. If you can't verify, don't include it.
- Each fit_rationale (1–2 sentences) must cite something concrete: their actual giving history, stated funding priorities, mission, or public statements — tied to our work.
- signal: one short note on capacity or why-now (recent grant, fund size, public interest), or null.
- sources: the URLs you actually used for this candidate.
- Respect the excluded list — don't return anyone on it.
- Bias toward funders who give to youth development, education equity, workforce/career readiness, or the angle's specific theme.

Call submit_candidates exactly once when done. Do not return candidates as text.`;

function buildDiscoveryPrompt(profile: AgentOrgProfile): string {
  if (profile.isResident) return RESIDENT_SYSTEM_PROMPT;
  return `You are a major-gifts prospect researcher for ${profile.orgName}, a nonprofit. You find net-new prospects worth cultivating.

Your job: given a funding ANGLE (a strategic thesis) and a TARGET TYPE, use web search to surface real, specific prospects who plausibly fund work like this and are NOT obvious existing donors. Quality over quantity.

RULES:
- Return 5–8 candidates, ranked best-fit first. Fewer high-confidence beats many weak ones.
- Every candidate must be a REAL, named, verifiable entity you found via search — never invented. If you can't verify, don't include it.
- Each fit_rationale (1–2 sentences) must cite something concrete: their actual giving history, stated funding priorities, mission, or public statements — tied to the angle's thesis.
- signal: one short note on capacity or why-now (recent grant, fund size, public interest), or null.
- sources: the URLs you actually used for this candidate.
- Respect the excluded list — don't return anyone on it.
- Bias toward funders whose stated priorities match the angle's specific theme. You have NOT been given any background about this organization beyond its name and the angle — never invent its mission, programs, or statistics.

Call submit_candidates exactly once when done. Do not return candidates as text.`;
}

const SUBMIT_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      description: "Ranked prospects, best fit first. 5–8 items.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The person or organization name." },
          org: { type: "string", description: "Affiliated org/employer/foundation, or empty string." },
          type: { type: "string", enum: ["individual", "foundation", "corporate"] },
          fit_rationale: { type: "string", description: "1–2 sentences citing a concrete reason they fit." },
          signal: { type: "string", description: "Capacity / why-now note, or empty string." },
          sources: { type: "array", items: { type: "string" }, description: "URLs used for this candidate." },
        },
        required: ["name", "type", "fit_rationale"],
      },
    },
  },
  required: ["candidates"],
} as const;

export async function runProspectDiscovery(input: {
  angleName: string;
  angleHook: string | null;
  type: DiscoveryType;
  exclude: string[];
}): Promise<DiscoveryResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Prospect discovery: ANTHROPIC_API_KEY must be set");
  const client = new Anthropic({ apiKey: key });
  // Dynamic import (like next-move): keeps this module importable from tests
  // that only exercise the pure parse helpers.
  const { getAgentOrgProfile } = await import("@/lib/agents/org-profile");

  const excludeBlock = input.exclude.length
    ? `\n\nEXCLUDE (already on our bench — do not return these):\n${input.exclude.slice(0, 200).map((n) => `- ${n}`).join("\n")}`
    : "";
  const userMessage =
    `ANGLE: ${input.angleName}\n` +
    (input.angleHook ? `THESIS: ${input.angleHook}\n` : "") +
    `TARGET TYPE: ${TYPE_NOUN[input.type]}\n` +
    excludeBlock +
    `\n\nFind net-new ${TYPE_NOUN[input.type]} who fit this angle. Search the web, then call submit_candidates.`;

  const response = await client.messages.create({
    model: DISCOVERY_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: "text", text: buildDiscoveryPrompt(await getAgentOrgProfile()), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES },
      { name: "submit_candidates", description: "Submit the ranked candidate list. Call exactly once.", input_schema: SUBMIT_SCHEMA },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
  });

  let webSearchCount = 0;
  let toolUse: Anthropic.Messages.ToolUseBlock | null = null;
  for (const block of response.content) {
    if (block.type === "server_tool_use" && block.name === "web_search") webSearchCount++;
    else if (block.type === "tool_use" && block.name === "submit_candidates") toolUse = block;
  }

  const u = response.usage;
  const tokensInput = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const tokensOutput = u.output_tokens ?? 0;
  const base = {
    model_used: response.model ?? DISCOVERY_MODEL,
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    web_search_count: webSearchCount,
  };

  const candidates = parseCandidates(toolUse ? toolUse.input : null);
  return { candidates, ...base };
}

/**
 * Coerce the model's submit_candidates tool input into safe, typed rows. Pure
 * and offline-testable: drops nameless rows, forces a known type, truncates free
 * text, and keeps only string sources (max 6). Exported for the eval suite.
 */
export function parseCandidates(rawInput: unknown): DiscoveryCandidate[] {
  const raw = (rawInput as { candidates?: unknown } | null)?.candidates;
  if (!Array.isArray(raw)) return [];

  const candidates: DiscoveryCandidate[] = [];
  for (const c of raw as Record<string, unknown>[]) {
    const name = typeof c.name === "string" ? c.name.trim() : "";
    if (!name) continue;
    const type = c.type === "foundation" || c.type === "corporate" ? c.type : "individual";
    candidates.push({
      name: cleanVoiceText(name).slice(0, 200),
      org: typeof c.org === "string" && c.org.trim() ? cleanVoiceText(c.org.trim()).slice(0, 200) : null,
      type,
      fit_rationale: cleanVoiceText(String(c.fit_rationale ?? "").trim()).slice(0, 600),
      signal: typeof c.signal === "string" && c.signal.trim() ? cleanVoiceText(c.signal.trim()).slice(0, 300) : null,
      sources: Array.isArray(c.sources)
        ? (c.sources as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 6)
        : [],
    });
  }
  return candidates;
}

// Sonnet rough rates per million tokens.
export function estimateDiscoveryCostUsd(tokensInput: number, tokensOutput: number): number {
  return (tokensInput * 3 + tokensOutput * 15) / 1_000_000;
}
