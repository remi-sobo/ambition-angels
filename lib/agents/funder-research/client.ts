/**
 * Anthropic client + funder research agent call.
 *
 * Structured output via tool calling: the agent calls `submit_brief` with
 * the 9-section brief as typed arguments. Anthropic serializes the tool
 * input as JSON itself — there is no "agent emits text we have to parse"
 * step — which eliminates the JSON-parse-failure class we hit on the
 * first real run (PR 10).
 *
 * Web search is still enabled via the built-in server-side tool, capped
 * at MAX_WEB_SEARCHES per brief. The two tools run in the same request:
 * Anthropic loops through web searches as needed, then the agent calls
 * submit_brief once at the end.
 *
 * On any failure AFTER the API call returns (e.g. agent didn't call the
 * tool, or shape validation rejected the args), throws AgentResultError
 * with metrics attached so the caller can still log token usage. This
 * is the fix for PR 10's "parse failure logs NULL tokens" bug.
 *
 * Never logs the API key. Never logs the system prompt.
 */

import Anthropic from "@anthropic-ai/sdk";
import FUNDER_RESEARCH_SYSTEM_PROMPT from "./prompt";
import type { BriefContent, ResearchContext, ResearchResult } from "./types";

// ── Configuration ──────────────────────────────────────────────────────────

export const AGENT_MODEL = "claude-opus-4-7";
export const MAX_WEB_SEARCHES = 20;
// 16000 leaves enough headroom for a complete 9-section brief. PR 10.1's
// first real run on Danielle Morris hit stop_reason='max_tokens' at 8,577
// output tokens with the submit_brief tool input arriving truncated and
// missing required sections. The largest complete brief is likely 10-13k.
const MAX_OUTPUT_TOKENS = 16000;

// ── Client ─────────────────────────────────────────────────────────────────

let cached: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "Funder research agent: ANTHROPIC_API_KEY must be set"
    );
  }
  cached = new Anthropic({ apiKey: key });
  return cached;
}

// ── Error type carrying agent metrics ──────────────────────────────────────

export type AgentMetrics = {
  model_used: string;
  tokens_input: number;
  tokens_output: number;
  duration_ms: number;
  web_search_count: number;
};

/**
 * Thrown when the agent API call SUCCEEDED but we couldn't extract a
 * usable brief from the response (no tool call, malformed tool input,
 * missing required sections). Carries metrics so the route handler can
 * log a 'partial' activity row with real token counts.
 */
export class AgentResultError extends Error {
  readonly metrics: AgentMetrics;
  readonly raw_response_summary?: string;

  constructor(
    message: string,
    metrics: AgentMetrics,
    rawResponseSummary?: string
  ) {
    super(message);
    this.name = "AgentResultError";
    this.metrics = metrics;
    this.raw_response_summary = rawResponseSummary;
  }
}

// ── Context → user-message string ──────────────────────────────────────────

function formatContext(ctx: ResearchContext): string {
  const fullName =
    [ctx.contact.first_name, ctx.contact.last_name]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join(" ") || "(no name on file)";

  const lines: string[] = [];
  lines.push("# Prospect record from our HubSpot mirror");
  lines.push("");
  lines.push(`Inferred prospect type: ${ctx.prospect_type}`);
  lines.push("");
  lines.push("## Contact");
  lines.push(`- Name: ${fullName}`);
  lines.push(`- Email: ${ctx.contact.email ?? "(unknown)"}`);
  lines.push(`- Phone: ${ctx.contact.phone ?? "(none)"}`);
  lines.push(`- Company (denormalized): ${ctx.contact.company ?? "(none)"}`);
  lines.push(`- Lifecycle stage: ${ctx.contact.lifecycle_stage ?? "(none)"}`);
  lines.push(`- Lead status: ${ctx.contact.lead_status ?? "(none)"}`);
  lines.push(`- HubSpot owner: ${ctx.contact.owner_id ?? "(none)"}`);
  lines.push(
    `- Last activity in HubSpot: ${ctx.contact.last_activity_at ?? "(none)"}`
  );
  lines.push(
    `- Created in HubSpot: ${ctx.contact.created_in_hubspot_at ?? "(none)"}`
  );
  lines.push("");

  if (ctx.company) {
    lines.push("## Associated company (matched by name in our HubSpot mirror)");
    lines.push(`- Name: ${ctx.company.name ?? "(unknown)"}`);
    lines.push(`- Domain: ${ctx.company.domain ?? "(unknown)"}`);
    lines.push(`- Industry: ${ctx.company.industry ?? "(unknown)"}`);
    lines.push(`- Last activity: ${ctx.company.last_activity_at ?? "(unknown)"}`);
    lines.push("");
  } else {
    lines.push("## Associated company");
    lines.push(
      "No matching company row found in our HubSpot mirror. The contact's `company` text is what we have."
    );
    lines.push("");
  }

  lines.push("## Associated deals");
  if (ctx.deals.length === 0) {
    lines.push("None.");
  } else {
    for (const d of ctx.deals) {
      lines.push(
        `- ${d.name ?? "(unnamed)"} — ${
          d.amount !== null ? `$${d.amount.toLocaleString()}` : "(no amount)"
        } — stage: ${d.stage ?? "(none)"} — pipeline: ${
          d.pipeline ?? "(none)"
        } — close: ${d.close_date ?? "(none)"} — last activity: ${
          d.last_activity_at ?? "(none)"
        }`
      );
    }
  }
  lines.push("");

  lines.push(
    `## Recent engagements (up to 25 most recent, by occurred_at desc)`
  );
  if (ctx.recent_engagements.length === 0) {
    lines.push("None on record.");
  } else {
    for (const e of ctx.recent_engagements) {
      const head = `- [${e.engagement_type ?? "engagement"}] ${
        e.occurred_at ?? "(unknown date)"
      }`;
      const subject = e.subject ? ` — ${e.subject}` : "";
      lines.push(head + subject);
      if (e.body_preview) {
        const preview = e.body_preview
          .replace(/\s+/g, " ")
          .slice(0, 300)
          .trim();
        if (preview) lines.push(`    ${preview}`);
      }
    }
  }
  lines.push("");

  lines.push(
    "## Internal connections (people in our HubSpot tied to this prospect or their org)"
  );
  if (ctx.internal_connections.length === 0) {
    lines.push("None found in our HubSpot mirror.");
  } else {
    for (const c of ctx.internal_connections) {
      lines.push(
        `- ${c.name} (${c.email ?? "no email"})${
          c.company ? ` — ${c.company}` : ""
        } — ${c.relationship_note}`
      );
    }
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  // Override the system prompt's "return JSON in text" directive with the
  // tool-call mechanism. The system prompt itself stays unchanged for now;
  // tighten its language in a follow-up PR once we confirm tool calling
  // works.
  lines.push(
    "When your research is complete, call the `submit_brief` tool with the full 9-section brief as structured arguments. Do not return the brief as text — the tool call is the only valid output."
  );

  return lines.join("\n");
}

// ── submit_brief tool schema ──────────────────────────────────────────────
// JSON Schema describing the BriefContent shape. Anthropic uses this to
// guide the model's tool call. Kept close to the existing BriefContent
// TypeScript type (lib/agents/funder-research/types.ts) so a successful
// tool call lands a value that satisfies the brief contract.

const personSchema = {
  type: "object",
  description:
    "A named person: their title, professional background, and any connection to youth / education / Bay Area work we care about.",
  properties: {
    name: { type: "string" },
    title: {
      type: "string",
      description: "Job title or board role. Empty string if unknown.",
    },
    professional_background: {
      type: "string",
      description: "1-3 sentences on their career. Empty string if unknown.",
    },
    connection_to_youth_education_bayarea: {
      type: "string",
      description:
        "Specific tie to youth / education / Bay Area, or 'no public connection found'. Empty string if not applicable.",
    },
  },
  required: [
    "name",
    "title",
    "professional_background",
    "connection_to_youth_education_bayarea",
  ],
} as const;

const recentGrantSchema = {
  type: "object",
  properties: {
    recipient: { type: "string" },
    amount: {
      type: "string",
      description:
        "Dollar amount with currency, e.g. '$250,000'. Empty string if unknown.",
    },
    purpose: {
      type: "string",
      description: "Short description of the grant's purpose. Empty string if unknown.",
    },
    year: {
      type: "string",
      description: "Year of the grant as a string, e.g. '2024'. Empty string if unknown.",
    },
  },
  required: ["recipient", "amount", "purpose", "year"],
} as const;

const readyStorySchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    narrative_2_3_sentences: { type: "string" },
    punchline_the_so_what: { type: "string" },
    when_to_use_it: { type: "string" },
  },
  required: [
    "title",
    "narrative_2_3_sentences",
    "punchline_the_so_what",
    "when_to_use_it",
  ],
} as const;

const mutualConnectionSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    how_connected: { type: "string" },
    source: { type: "string" },
    recent_touch_if_any: {
      type: "string",
      description: "Empty string if no recent touch.",
    },
  },
  required: ["name", "how_connected", "source", "recent_touch_if_any"],
} as const;

const BRIEF_INPUT_SCHEMA = {
  type: "object",
  properties: {
    snapshot: {
      type: "string",
      description:
        "2-3 line scout report: who they are, why this meeting is happening, what they'll likely say no to.",
    },
    what_they_care_about: {
      type: "object",
      properties: {
        mission_statement: {
          type: "string",
          description: "Verbatim where possible. Empty string if unknown.",
        },
        funding_priorities: {
          type: "array",
          description: "5-7 tight bullets of what they fund. Empty array if unknown.",
          items: { type: "string" },
        },
        recent_grants: {
          type: "array",
          description:
            "Grants from the last 24 months, highest-signal first. Empty array if unknown.",
          items: recentGrantSchema,
        },
        public_statements: {
          type: "string",
          description:
            "Recent quotes from leadership or RFPs signaling priority shifts. Empty string if none.",
        },
        what_they_dont_fund: {
          type: "string",
          description:
            "Explicit exclusions. Flag loudly if they exclude work like ours. Empty string if none known.",
        },
      },
      required: [
        "mission_statement",
        "funding_priorities",
        "recent_grants",
        "public_statements",
        "what_they_dont_fund",
      ],
    },
    how_we_fit: {
      type: "object",
      properties: {
        framing_note: {
          type: "string",
          description:
            "Reminder line that this section is a hypothesis to test in the meeting, not a pitch.",
        },
        matching_priorities: {
          type: "array",
          description: "2-4 lines from their stated priorities where we plausibly fit.",
          items: { type: "string" },
        },
        our_matching_stories: {
          type: "array",
          description:
            "2-4 lines from Ambition Angels' story that map to their priorities. Use Remi's actual language.",
          items: { type: "string" },
        },
        honest_gaps: {
          type: "array",
          description: "Where we don't fit, phrased diplomatically with context.",
          items: { type: "string" },
        },
      },
      required: [
        "framing_note",
        "matching_priorities",
        "our_matching_stories",
        "honest_gaps",
      ],
    },
    people: {
      type: "object",
      properties: {
        primary_contact: {
          // Allow null when no primary contact is identified; otherwise a
          // full Person object.
          oneOf: [{ type: "null" }, personSchema],
          description: "The person we'd be meeting with, or null if unknown.",
        },
        board_members: {
          type: "array",
          description:
            "Focus on people with youth/education/Bay Area connections.",
          items: personSchema,
        },
        staff_of_note: {
          type: "array",
          description: "Program officers, EDs, others Remi might encounter.",
          items: personSchema,
        },
      },
      required: ["primary_contact", "board_members", "staff_of_note"],
    },
    giving_profile: {
      type: "object",
      properties: {
        annual_giving: {
          type: "string",
          description:
            "Total annual giving from most recent 990 or public report. Empty if unknown.",
        },
        grant_size_range: {
          type: "string",
          description: "Typical low–high. Empty if unknown.",
        },
        decision_cadence: {
          type: "string",
          description:
            "Rolling / quarterly / annual / board-driven. Empty if unknown.",
        },
        application_process: {
          type: "string",
          description: "How to apply, or 'by invitation only'. Empty if unknown.",
        },
      },
      required: [
        "annual_giving",
        "grant_size_range",
        "decision_cadence",
        "application_process",
      ],
    },
    mutual_connections: {
      type: "array",
      description: "Empty array if none. Never fabricate.",
      items: mutualConnectionSchema,
    },
    meeting_playbook: {
      type: "object",
      properties: {
        open_questions: {
          type: "array",
          description:
            "Open-ended questions to surface what they actually want.",
          items: { type: "string" },
        },
        ready_stories: {
          type: "array",
          description: "2-4 stories from Remi's life and work. Pull from the story bank.",
          items: readyStorySchema,
        },
        one_thing_to_learn: {
          type: "string",
          description:
            "The single most important specific thing Remi should walk away knowing.",
        },
        suggested_next_ask: {
          type: "string",
          description:
            "First meetings rarely have a direct money ask; use prospect_type to choose the right ask shape.",
        },
      },
      required: [
        "open_questions",
        "ready_stories",
        "one_thing_to_learn",
        "suggested_next_ask",
      ],
    },
    source_notes_and_gaps: {
      type: "object",
      properties: {
        sources: {
          type: "array",
          description: "URLs and document titles used. Cite anything that could be wrong.",
          items: { type: "string" },
        },
        gaps: {
          type: "array",
          description: "Big stuff you tried to verify but couldn't. Keep light.",
          items: { type: "string" },
        },
      },
      required: ["sources", "gaps"],
    },
    raw_research_notes: {
      type: "string",
      description:
        "Full research log in markdown. Search queries, raw quotes, reasoning that didn't make the structured sections.",
    },
  },
  required: [
    "snapshot",
    "what_they_care_about",
    "how_we_fit",
    "people",
    "giving_profile",
    "mutual_connections",
    "meeting_playbook",
    "source_notes_and_gaps",
    "raw_research_notes",
  ],
} as const;

// ── Defensive shape validation on tool input ──────────────────────────────

function assertBriefContent(value: unknown): asserts value is BriefContent {
  if (!value || typeof value !== "object") {
    throw new Error("submit_brief input was not an object.");
  }
  const required = [
    "snapshot",
    "what_they_care_about",
    "how_we_fit",
    "people",
    "giving_profile",
    "mutual_connections",
    "meeting_playbook",
    "source_notes_and_gaps",
    "raw_research_notes",
  ] as const;
  const obj = value as Record<string, unknown>;
  const missing = required.filter((k) => !(k in obj));
  if (missing.length > 0) {
    throw new Error(
      `submit_brief input missing required sections: ${missing.join(", ")}`
    );
  }
}

// ── Response summarization for failure logs ───────────────────────────────

/**
 * Builds a debug-friendly summary of the agent's response when extraction
 * fails. Truncates to ~50KB so we don't blow up the jsonb metadata column.
 * Drops web_search_tool_result blocks (they're big and noisy).
 */
function summarizeResponse(response: Anthropic.Messages.Message): string {
  const MAX_BYTES = 50_000;
  const parts: string[] = [];
  parts.push(`stop_reason: ${response.stop_reason ?? "(none)"}`);
  parts.push(`stop_sequence: ${response.stop_sequence ?? "(none)"}`);
  parts.push(`model: ${response.model}`);
  parts.push(`content blocks (count=${response.content.length}):`);
  for (let i = 0; i < response.content.length; i++) {
    const b = response.content[i];
    if (b.type === "text") {
      const t = b.text.slice(0, 4000);
      parts.push(
        `  [${i}] text (${b.text.length} chars): ${t}${
          b.text.length > 4000 ? "…" : ""
        }`
      );
    } else if (b.type === "tool_use") {
      const inputStr = JSON.stringify(b.input).slice(0, 2000);
      parts.push(
        `  [${i}] tool_use name=${b.name} id=${b.id} input=${inputStr}`
      );
    } else if (b.type === "server_tool_use") {
      const inputStr = JSON.stringify(b.input).slice(0, 500);
      parts.push(`  [${i}] server_tool_use name=${b.name} input=${inputStr}`);
    } else if (b.type === "web_search_tool_result") {
      parts.push(`  [${i}] web_search_tool_result (omitted, noisy)`);
    } else {
      parts.push(`  [${i}] ${(b as { type: string }).type} (omitted)`);
    }
  }
  let s = parts.join("\n");
  if (s.length > MAX_BYTES) {
    s = s.slice(0, MAX_BYTES) + `\n…(truncated, full length ${parts.join("\n").length} chars)`;
  }
  return s;
}

// ── Public entry point ────────────────────────────────────────────────────

export async function runFunderResearch(
  context: ResearchContext
): Promise<ResearchResult> {
  const client = getAnthropic();
  const userMessage = formatContext(context);

  const startedAt = Date.now();
  // The Anthropic SDK's type for `tools` is a discriminated union covering
  // built-in server tools and custom tools. Our schema-typed const trips
  // structural checks; cast to the SDK's permissive type at the boundary.
  // The schema itself is validated by Anthropic at request time.
  const response = await client.messages.create({
    model: AGENT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: FUNDER_RESEARCH_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: MAX_WEB_SEARCHES,
      },
      {
        name: "submit_brief",
        description:
          "Submit the final 9-section research brief. Call this exactly once when your research is complete. Do not return the brief as text.",
        input_schema: BRIEF_INPUT_SCHEMA,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
  });
  const durationMs = Date.now() - startedAt;

  // Count server-side web searches and pull out the submit_brief tool call
  // in one pass over the content array.
  let webSearchCount = 0;
  let briefToolUse: Anthropic.Messages.ToolUseBlock | null = null;
  for (const block of response.content) {
    if (block.type === "server_tool_use" && block.name === "web_search") {
      webSearchCount++;
    } else if (block.type === "tool_use" && block.name === "submit_brief") {
      briefToolUse = block;
    }
  }

  // Compute metrics from the response BEFORE attempting brief extraction —
  // so any downstream failure can carry them up to the route handler.
  const u = response.usage;
  const tokensInput =
    (u.input_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0);
  const tokensOutput = u.output_tokens ?? 0;
  const metrics: AgentMetrics = {
    model_used: response.model ?? AGENT_MODEL,
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    duration_ms: durationMs,
    web_search_count: webSearchCount,
  };

  if (!briefToolUse) {
    throw new AgentResultError(
      "Agent did not call submit_brief tool. The response contained no tool_use block for submit_brief.",
      metrics,
      summarizeResponse(response)
    );
  }

  try {
    assertBriefContent(briefToolUse.input);
  } catch (e) {
    throw new AgentResultError(
      e instanceof Error ? e.message : String(e),
      metrics,
      summarizeResponse(response)
    );
  }

  return {
    brief: briefToolUse.input,
    model_used: metrics.model_used,
    tokens_input: metrics.tokens_input,
    tokens_output: metrics.tokens_output,
    duration_ms: metrics.duration_ms,
    web_search_count: metrics.web_search_count,
  };
}
