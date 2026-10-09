/**
 * Pure prompt builder for the Capture parse (specs/bloomos-capture.md, C2
 * step 5). No I/O, no server-only, so it is unit-tested like
 * lib/meetings/transcript-prompt.ts. The route wraps it with generateStructured.
 *
 * The system prompt is byte-stable so the gateway's ephemeral cache hits; every
 * per-capture fact (date, people, candidates, transcript) goes in the user
 * prompt. The model may cite people and orgs ONLY by the refs listed in the
 * prompt; anything else is heard_name text. That is the whole trust model:
 * the server builds the candidate list, the model can only choose from it.
 */

import { TASK_CATEGORIES } from "@/app/admin/ops/_types/ops";
import { MAX_CARDS, MAX_TRANSCRIPT_CHARS } from "./constants";
import { CAPTURE_DESTS, DRAFT_CHANNELS, INTERACTION_KINDS } from "./types";
import type { Candidate, ContextEntity, StaffMember } from "./types";

export const CAPTURE_TOOL_NAME = "submit_capture_cards";

export const CAPTURE_TOOL = {
  name: CAPTURE_TOOL_NAME,
  description:
    "Submit the cards to propose from this voice note. Call exactly once. Each card is one distinct thing to file; the operator confirms or discards each one.",
  input_schema: {
    type: "object",
    properties: {
      cards: {
        type: "array",
        maxItems: MAX_CARDS,
        items: {
          type: "object",
          properties: {
            dest: { type: "string", enum: [...CAPTURE_DESTS] },
            source_sentence: {
              type: "string",
              description: "The transcript sentence(s) this card came from, verbatim, <= 300 chars.",
            },
            ref: {
              type: ["string", "null"],
              description:
                "Candidate ref (c1, c2, ...) for the person or org this card is about. null when no listed candidate fits.",
            },
            org_ref: {
              type: ["string", "null"],
              description:
                "Candidate ref for the organization mentioned alongside the person (e.g. 'from the Koshland Foundation'), when a separate candidate fits. null otherwise.",
            },
            heard_name: {
              type: ["string", "null"],
              description: "The name as heard, when ref is null or uncertain. null otherwise.",
            },
            confidence: {
              type: "number",
              description: "0..1 confidence that ref is the right record for the name heard.",
            },
            kind: {
              type: ["string", "null"],
              enum: [...INTERACTION_KINDS, null],
              description: "interaction only.",
            },
            notes: {
              type: ["string", "null"],
              description: "interaction: one or two plain sentences of what happened. task: optional detail.",
            },
            occurred_at: {
              type: ["string", "null"],
              description: "interaction only, YYYY-MM-DD. Defaults to today when omitted.",
            },
            title: { type: ["string", "null"], description: "task only, imperative, <= 120 chars." },
            category: { type: ["string", "null"], enum: [...TASK_CATEGORIES, null], description: "task only." },
            assignee_ref: { type: ["string", "null"], description: "task only, staff ref (s1, s2, ...) or null." },
            due_date: { type: ["string", "null"], description: "task only, YYYY-MM-DD or null." },
            text: { type: ["string", "null"], description: "thought only." },
            channel: { type: ["string", "null"], enum: [...DRAFT_CHANNELS, null], description: "message_draft only." },
            subject: { type: ["string", "null"], description: "message_draft, email only." },
            body: { type: ["string", "null"], description: "message_draft only, in the operator's voice." },
          },
          required: ["dest", "source_sentence", "ref", "heard_name", "confidence"],
        },
      },
      youth_skipped: {
        type: "integer",
        description: "Count of things in the note that were about a student or youth participant and were NOT turned into cards.",
      },
    },
    required: ["cards", "youth_skipped"],
  },
} as const;

const SYSTEM = `You are the Capture parser inside BloomOS, the operating system for a small nonprofit. The operator just dictated a short voice note after a conversation. Turn it into a stack of proposed cards that they will confirm, edit, or discard. Nothing you return is filed until a human confirms it.

Card destinations:
- interaction: something that happened with a donor, funder, partner, or board member. kind is one of ${INTERACTION_KINDS.join(", ")} (never email). notes is one or two plain sentences of what happened and what they said. occurred_at defaults to today.
- task: a concrete follow-up someone on staff should do. title is imperative. category is one of ${TASK_CATEGORIES.join(", ")}. assignee_ref is a staff ref when the note names who should do it, else null. due_date only when a date or day was said.
- thought: an idea, lead, or parking-lot item with no owner or deadline. text only.
- message_draft: the operator asked to draft a message. recipient is the person ref, channel is email or text, body is in the operator's voice. Never claim it was sent.

Rules:
- One card per distinct thing to file. At most ${MAX_CARDS} cards. Do not split one fact into several cards.
- Cite people and organizations ONLY by the candidate refs listed in the prompt (c1, c2, ...). If a name was heard but no listed candidate fits, set ref to null and put the name as heard in heard_name. Never invent a ref, never guess a ref for a name that is not clearly the same person or organization.
- When a person is named together with their organization ("Maria Chen from the Koshland Foundation"), ref is the person and org_ref is the organization, each only if a listed candidate fits.
- Never add facts that were not said: no amounts, dates, commitments, or sentiments the operator did not state. Resolve relative dates ("Friday", "next week", "end of month") against today's date in the operator's timezone and write them as YYYY-MM-DD.
- Staff assignees ONLY by staff ref (s1, s2, ...). If the note says to have someone do something and that person is not on the staff list, leave assignee_ref null and keep their name in the title.
- If something in the note is about a student, teen, youth participant, or their family, do NOT make a card for it. Count it in youth_skipped instead.
- Voice: plain sentences, no em dashes, no exclamation marks, no fundraising jargon.
- confidence is your 0 to 1 estimate that ref is the right record for the name you heard. Use the candidate meta (type, last touch) to decide. When two candidates could both be it, pick the likelier one and lower the confidence.

Call ${CAPTURE_TOOL_NAME} exactly once.`;

/** The byte-stable system prompt. */
export function buildCaptureSystem(): string {
  return SYSTEM;
}

export type CapturePromptInput = {
  transcript: string;
  /** YYYY-MM-DD in tz. */
  todayIso: string;
  /** IANA timezone, e.g. America/Los_Angeles. */
  tz: string;
  userName: string;
  staff: StaffMember[];
  context: ContextEntity | null;
  candidates: Candidate[];
};

function weekday(todayIso: string, tz: string): string {
  // todayIso is already the operator's local date; format its weekday without tz shifting.
  const [y, m, d] = todayIso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const name = dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return name ? ` (${name}, ${tz})` : ` (${tz})`;
}

/** The per-capture user prompt. */
export function buildCapturePrompt(input: CapturePromptInput): string {
  const L: string[] = [];
  L.push(`Today is ${input.todayIso}${weekday(input.todayIso, input.tz)}.`);
  L.push(`The operator dictating this note is ${input.userName || "the operator"}.`);
  L.push("");

  L.push("Staff who can be assigned tasks (cite by ref):");
  if (input.staff.length === 0) L.push("- none listed; leave assignee_ref null");
  for (const s of input.staff) L.push(`- ${s.ref}: ${s.name}`);
  L.push("");

  if (input.context) {
    L.push(
      `This note was recorded from the page of ${input.context.type} "${input.context.name}"${
        input.context.orgName ? ` (${input.context.orgName})` : ""
      }. Unless the note clearly says otherwise, that is who it is about.`,
    );
    L.push("");
  }

  L.push("Candidate people and organizations found in the records (cite by ref; never any other id):");
  if (input.candidates.length === 0) L.push("- none matched; use heard_name for anyone mentioned");
  for (const c of input.candidates) {
    const bits: string[] = [c.kind];
    if (c.orgName && c.orgName !== c.name) bits.push(c.orgName);
    if (c.meta) bits.push(c.meta);
    if (c.context) bits.push("page context");
    if (c.spans.length) bits.push(`heard as "${c.spans.join('" / "')}"`);
    L.push(`- ${c.ref}: ${c.name} (${bits.join(" · ")})`);
  }
  L.push("");
  L.push("Note: a candidate of kind prospect can be mentioned in a task or thought but cannot receive an interaction; say so by leaving ref null and heard_name set if an interaction is about them.");
  L.push("");

  L.push("Transcript:");
  L.push(input.transcript.slice(0, MAX_TRANSCRIPT_CHARS));
  return L.join("\n");
}
