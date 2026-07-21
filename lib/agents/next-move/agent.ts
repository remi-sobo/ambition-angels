/**
 * Per-person next-move agent. Same shape as the NBA agent: structured output
 * via a forced tool call through the shared gateway, then a pure, tested
 * coercion step. No web search — it reasons only over the dossier the route
 * assembles, so a run costs cents and can never leak beyond the CRM.
 *
 * Model: Opus-tier. This is judgment + writing in the operator's voice for one
 * high-value relationship at a time — the quality delta over Sonnet matters
 * and the per-call cost (a few cents) doesn't.
 */
import { buildNextMovePrompt } from "./prompt";
import { generateStructured } from "@/lib/ai/gateway";
import { cleanVoiceText } from "@/lib/ai/voice";
import type { NextMoveChannel, NextMoveDossier, NextMoveSuggestion } from "./types";

export const NEXT_MOVE_MODEL = "claude-opus-4-8";
const MAX_OUTPUT_TOKENS = 1500;
const CHANNELS: NextMoveChannel[] = ["email", "call", "meeting", "note", "wait", "other"];

const NEXT_MOVE_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", description: "Concrete imperative next move, <= 140 chars." },
    rationale: {
      type: "string",
      description: "1-2 sentences citing the specific dossier facts that drive this move, <= 300 chars.",
    },
    channel: { type: "string", enum: CHANNELS, description: "How to do it. 'wait' if no touch is right now." },
    due_in_days: { type: "integer", description: "Days from today to do it, 0-30." },
    email_subject: {
      type: ["string", "null"],
      description: "Subject line when channel is email; null otherwise.",
    },
    email_body: {
      type: ["string", "null"],
      description: "Ready-to-send email body when channel is email (plain text, signed with the operator's first name); null otherwise.",
    },
  },
  required: ["action", "rationale", "channel", "due_in_days", "email_subject", "email_body"],
} as const;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Render the dossier as the user prompt. Pure, so it's directly testable. */
export function formatDossier(d: NextMoveDossier, today: string): string {
  const L: string[] = [];
  L.push(`Today is ${today}.`);
  L.push("");
  L.push(`## ${d.name}`);
  L.push(`- Kind: ${d.kind}${d.entityType === "fr_prospects" ? " (prospect on the bench — no giving history in our books)" : ""}`);
  L.push(`- Email on file: ${d.email ?? "none"}`);
  if (d.doNotContact) L.push(`- DO NOT CONTACT is set. Propose only internal moves.`);
  if (d.tags.length) L.push(`- Tags: ${d.tags.join(", ")}`);
  if (d.notes) L.push(`- Notes: ${d.notes}`);

  if (d.entityType === "constituent") {
    L.push("");
    L.push("### Giving");
    L.push(
      `- ${money(d.lifetimeGiving)} lifetime over ${d.giftCount} gift(s)` +
        (d.activeRecurring ? " · active monthly plan" : "")
    );
    for (const g of d.gifts) L.push(`- ${g.date}: ${money(g.amount)}${g.method ? ` (${g.method})` : ""}`);
    if (d.retentionFlags.length) L.push(`- Retention flags: ${d.retentionFlags.join(", ")}`);
    if (d.engagementScore !== null) L.push(`- Engagement score: ${d.engagementScore}/100`);
    L.push(`- Last thanked: ${d.lastThankedAt ?? "no thank-you on record"}`);
  }

  L.push("");
  L.push("### Conversations (newest first)");
  if (d.interactions.length === 0) L.push("- none on record");
  for (const i of d.interactions) {
    L.push(`- ${i.date} ${i.kind}${i.direction ? ` (${i.direction})` : ""}: ${i.summary}`);
  }

  if (d.openAsks.length) {
    L.push("");
    L.push("### Open asks");
    for (const a of d.openAsks) {
      L.push(
        `- Stage ${a.stage}${a.askAmount ? ` · ask ${money(a.askAmount)}` : ""}` +
          (a.nextStep ? ` · planned next step: "${a.nextStep}"${a.nextStepDue ? ` due ${a.nextStepDue}` : ""}` : "")
      );
    }
  }

  if (d.openTasks.length) {
    L.push("");
    L.push("### Open tasks already on the board");
    for (const t of d.openTasks) L.push(`- ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}`);
  }

  if (d.prospectContext) {
    L.push("");
    L.push("### Prospect context");
    L.push(d.prospectContext);
  }

  if (d.researchExcerpt) {
    L.push("");
    L.push("### Research on file (excerpt)");
    L.push(d.researchExcerpt);
  }

  L.push("");
  L.push("Recommend the single best next move and call submit_next_move.");
  return L.join("\n");
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * Coerce the tool input into a safe suggestion. Pure and offline-testable:
 * forces a known channel, clamps due days, truncates text, strips the email
 * when the channel isn't email or contact is disallowed, and returns null when
 * the model produced no usable action.
 */
export function parseNextMove(rawInput: unknown, doNotContact: boolean): NextMoveSuggestion | null {
  const r = rawInput as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const action = cleanVoiceText(String(r.action ?? "").trim()).slice(0, 200);
  if (!action) return null;

  let channel: NextMoveChannel = CHANNELS.includes(r.channel as NextMoveChannel)
    ? (r.channel as NextMoveChannel)
    : "other";
  if (doNotContact && (channel === "email" || channel === "call" || channel === "meeting")) {
    channel = "note";
  }

  const emailAllowed = channel === "email" && !doNotContact;
  const subject = emailAllowed && typeof r.email_subject === "string" ? r.email_subject.trim().slice(0, 140) : null;
  const body = emailAllowed && typeof r.email_body === "string" ? r.email_body.trim().slice(0, 4000) : null;

  return {
    action,
    rationale: cleanVoiceText(String(r.rationale ?? "").trim()).slice(0, 400),
    channel,
    dueInDays: typeof r.due_in_days === "number" ? clamp(r.due_in_days, 0, 30) : 3,
    emailSubject: subject || null,
    emailBody: body || null,
  };
}

export type NextMoveResult = {
  suggestion: NextMoveSuggestion | null;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  model: string;
};

export async function runNextMove(dossier: NextMoveDossier, today: string): Promise<NextMoveResult> {
  // Lazy import: org-profile pulls the auth/session stack, which the pure
  // parse/format exports of this module (unit-tested) must not drag in.
  const { getAgentOrgProfile } = await import("@/lib/agents/org-profile");
  const { input, usage, model, costUsd } = await generateStructured({
    system: buildNextMovePrompt(await getAgentOrgProfile()),
    prompt: formatDossier(dossier, today),
    model: NEXT_MOVE_MODEL,
    maxTokens: MAX_OUTPUT_TOKENS,
    tool: {
      name: "submit_next_move",
      description: "Submit the single best next move for this person. Call exactly once.",
      input_schema: NEXT_MOVE_SCHEMA,
    },
  });

  return {
    suggestion: parseNextMove(input, dossier.doNotContact),
    tokensInput: usage.inputTokens,
    tokensOutput: usage.outputTokens,
    costUsd,
    model,
  };
}
