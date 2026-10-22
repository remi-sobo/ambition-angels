import type { AckContext } from "@/lib/admin/ackContext";
import { ackAmount } from "@/lib/admin/ackFormat";

/**
 * The thank-you drafter's prompt (specs/needs-you-popout-thank-yous.md, PR 4).
 * PURE: the draft route loads the facts (org-fenced) and the org's voice, and
 * this turns them into a system prompt, a user prompt, and the tool schema the
 * model must answer through. Tests feed it fixtures.
 *
 * The template is a platform default in code; each org's voice is DATA
 * (orgs.settings.ack_voice). Nothing here names Ambition Angels: an org with
 * no voice settings gets its own name as the signer and a neutral tone.
 *
 * The model sees only facts the server loaded itself. The client sends a gift
 * id and an optional nudge, never donor data.
 */

export type AckDraftKind = "email" | "talking_points";

export type AckVoice = {
  signerName: string;
  signerTitle: string | null;
  toneNotes: string | null;
  styleRules: string | null;
  missionLine: string | null;
};

const NUDGE_MAX = 200;

const str = (v: unknown, max = 600): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/** The org's voice from orgs.settings.ack_voice, with platform defaults. */
export function resolveVoice(settings: unknown, orgName: string): AckVoice {
  const raw =
    settings && typeof settings === "object" && "ack_voice" in settings
      ? (settings as { ack_voice: unknown }).ack_voice
      : null;
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    signerName: str(v.signer_name, 120) ?? orgName,
    signerTitle: str(v.signer_title, 120),
    toneNotes: str(v.tone_notes),
    styleRules: str(v.style_rules),
    missionLine: str(v.mission_line),
  };
}

/** The person's adjustment ("warmer", "mention the gala"), bounded. */
export function cleanNudge(n: unknown): string | null {
  return str(n, NUDGE_MAX);
}

const SYSTEM = `You draft thank-you messages from a nonprofit to its donors, for a staff member to review, edit, and send themselves.

Hard rules:
- Use only the facts given. Do not invent program outcomes, numbers, names, events, or anything the gift "made possible" beyond the mission line.
- Mention a number only if it appears in the facts.
- No tax, receipt, or deductibility language. A receipt is sent separately.
- Address the donor by first name when one is given; an organization by its name.
- Write as the signer named in the facts and sign with their name.
- Follow the organization's voice and style rules when given.
- Answer only by calling the tool.`;

export function buildAckDraftPrompt(input: {
  ctx: AckContext;
  orgName: string;
  voice: AckVoice;
  kind: AckDraftKind;
  nudge: string | null;
}): { system: string; prompt: string } {
  const { ctx, orgName, voice, kind, nudge } = input;
  const facts: string[] = [];
  facts.push(`Organization: ${orgName}`);
  facts.push(`Signer: ${voice.signerName}${voice.signerTitle ? `, ${voice.signerTitle}` : ""}`);
  if (voice.missionLine) facts.push(`Mission line: ${voice.missionLine}`);
  facts.push(
    `Donor: ${ctx.donor.name} (${ctx.donor.isOrganization ? "organization" : "person"})` +
      (ctx.donor.firstName ? `, first name ${ctx.donor.firstName}` : ""),
  );
  facts.push(`Gift: ${ackAmount(ctx.amount)} on ${ctx.giftDate}`);
  const toward = [ctx.campaign && `campaign "${ctx.campaign}"`, ctx.fund && `fund "${ctx.fund}"`, ctx.appeal && `appeal "${ctx.appeal}"`].filter(Boolean);
  if (toward.length) facts.push(`Given toward: ${toward.join(", ")}`);
  facts.push(
    ctx.history.ordinal === 1
      ? "Giving history: this is their first gift."
      : `Giving history: gift number ${ctx.history.ordinal} of ${ctx.history.lifetimeCount}` +
          (ctx.history.previous ? `, previous gift on ${ctx.history.previous.date}` : ""),
  );
  if (ctx.notes) facts.push(`Note on this gift: ${ctx.notes}`);
  if (ctx.donor.whyMatters) facts.push(`Why this donor matters: ${ctx.donor.whyMatters}`);

  const voiceLines: string[] = [];
  if (voice.toneNotes) voiceLines.push(`Voice: ${voice.toneNotes}`);
  if (voice.styleRules) voiceLines.push(`Style rules: ${voice.styleRules}`);
  if (!voiceLines.length) voiceLines.push("Voice: warm, plain, and brief.");

  const task =
    kind === "talking_points"
      ? "Task: write 3 to 5 short talking points for a thank-you phone call, then a follow-up email of no more than 2 sentences with a subject line."
      : "Task: write a thank-you email with a subject line and a body under 150 words.";

  const prompt = [
    "Facts (use only these):",
    ...facts.map((f) => `- ${f}`),
    "",
    ...voiceLines,
    "",
    task,
    nudge ? `\nAdjustment from the staff member (a preference, not a fact): ${nudge}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { system: SYSTEM, prompt };
}

export function ackDraftTool(kind: AckDraftKind) {
  const email = {
    subject: { type: "string", description: "Email subject line." },
    body: { type: "string", description: "Email body, signed by the signer." },
  };
  return kind === "talking_points"
    ? {
        name: "thank_you_call",
        description: "Talking points for a thank-you call, plus a short follow-up email.",
        input_schema: {
          type: "object",
          properties: {
            points: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
            ...email,
          },
          required: ["points", "subject", "body"],
          additionalProperties: false,
        },
      }
    : {
        name: "thank_you_email",
        description: "A thank-you email.",
        input_schema: {
          type: "object",
          properties: email,
          required: ["subject", "body"],
          additionalProperties: false,
        },
      };
}

export type AckDraft = { subject: string; body: string; points: string[] | null };

/** Coerce the tool input; null when it is not usable. */
export function parseAckDraft(input: unknown, kind: AckDraftKind): AckDraft | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const subject = str(o.subject, 200);
  const body = str(o.body, 4000);
  if (!subject || !body) return null;
  if (kind === "talking_points") {
    const points = Array.isArray(o.points)
      ? o.points.map((p) => str(p, 400)).filter((p): p is string => Boolean(p)).slice(0, 6)
      : [];
    if (!points.length) return null;
    return { subject, body, points };
  }
  return { subject, body, points: null };
}
