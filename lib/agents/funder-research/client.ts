/**
 * Anthropic client + funder research agent call.
 *
 * Lazy-init pattern matches lib/supabase/admin.ts. The system prompt is
 * sent with cache_control so subsequent calls within the 5-minute TTL pay
 * the cache-read rate instead of the full input rate. Dynamic context
 * (HubSpot record + connections) goes in the FIRST USER MESSAGE so the
 * cached system prompt stays byte-identical across invocations.
 *
 * Web search is enabled via Anthropic's built-in server-side tool, capped
 * at MAX_WEB_SEARCHES per brief. The SDK handles the search loop on
 * Anthropic's side — we get one final response back with text + interleaved
 * tool-use blocks.
 *
 * Never logs the API key.
 */

import Anthropic from "@anthropic-ai/sdk";
import FUNDER_RESEARCH_SYSTEM_PROMPT from "./prompt";
import type { BriefContent, ResearchContext, ResearchResult } from "./types";

// ── Configuration ──────────────────────────────────────────────────────────

export const AGENT_MODEL = "claude-opus-4-7";
export const MAX_WEB_SEARCHES = 20;
const MAX_OUTPUT_TOKENS = 8192;

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

// ── Context → user-message string ──────────────────────────────────────────

function formatContext(ctx: ResearchContext): string {
  const fullName = [ctx.contact.first_name, ctx.contact.last_name]
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
  lines.push(`- Last activity in HubSpot: ${ctx.contact.last_activity_at ?? "(none)"}`);
  lines.push(`- Created in HubSpot: ${ctx.contact.created_in_hubspot_at ?? "(none)"}`);
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

  lines.push("## Internal connections (people in our HubSpot tied to this prospect or their org)");
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
  lines.push(
    "Produce the 9-section JSON brief per your instructions. Return JSON only, no markdown wrappers."
  );

  return lines.join("\n");
}

// ── JSON extraction ────────────────────────────────────────────────────────

/**
 * Pull the JSON object out of the agent's text response. The system prompt
 * tells it to return JSON only — but be defensive about code fences in case
 * the model wraps it anyway.
 */
function extractJson(text: string): unknown {
  let s = text.trim();
  // Strip leading/trailing code fences if present.
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  // Best effort: find the first '{' and the last '}'. JSON objects are
  // delimited; anything outside is preamble/postamble we ignore.
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("Agent response contained no JSON object.");
  }
  const candidate = s.slice(firstBrace, lastBrace + 1);
  return JSON.parse(candidate);
}

function assertBriefContent(parsed: unknown): asserts parsed is BriefContent {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Agent response was not a JSON object.");
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
  const obj = parsed as Record<string, unknown>;
  const missing = required.filter((k) => !(k in obj));
  if (missing.length > 0) {
    throw new Error(
      `Agent response missing required brief sections: ${missing.join(", ")}`
    );
  }
}

// ── Public entry point ────────────────────────────────────────────────────

export async function runFunderResearch(
  context: ResearchContext
): Promise<ResearchResult> {
  const client = getAnthropic();
  const userMessage = formatContext(context);

  const startedAt = Date.now();
  const response = await client.messages.create({
    model: AGENT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    // cache_control on the system prompt: identical text across calls hits
    // the cache-read rate within the 5-minute TTL.
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
    ],
  });
  const durationMs = Date.now() - startedAt;

  // Concatenate text blocks; count server_tool_use blocks for web_search.
  let combinedText = "";
  let webSearchCount = 0;
  for (const block of response.content) {
    if (block.type === "text") {
      combinedText += block.text;
    } else if (
      block.type === "server_tool_use" &&
      block.name === "web_search"
    ) {
      webSearchCount++;
    }
  }

  const parsed = extractJson(combinedText);
  assertBriefContent(parsed);

  // Token accounting — sum all input categories so the activity log
  // reflects total tokens billed (cache writes / cache reads / regular).
  const u = response.usage;
  const tokensInput =
    (u.input_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0);
  const tokensOutput = u.output_tokens ?? 0;

  return {
    brief: parsed,
    model_used: response.model ?? AGENT_MODEL,
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    duration_ms: durationMs,
    web_search_count: webSearchCount,
  };
}
