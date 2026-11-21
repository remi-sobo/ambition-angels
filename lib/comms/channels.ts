/**
 * Composer channels (specs/comms-module.md §6.1, §7.5, §14).
 *
 * One story, many outputs. Each channel is a shape with its own length, voice,
 * and job — the same win becomes a LinkedIn post, a thank-you paragraph, or a
 * grant anecdote without being rewritten from scratch each time.
 *
 * Pure data and pure prompt fragments: no server imports, so the sheet, the
 * route, and the tests all read one definition.
 */

export const CHANNELS = [
  "linkedin",
  "newsletter_section",
  "thank_you",
  "grant_anecdote",
  "board_update",
  "news_flash",
  "personal_forward",
] as const;

export type Channel = (typeof CHANNELS)[number];

export const isChannel = (v: unknown): v is Channel =>
  typeof v === "string" && (CHANNELS as readonly string[]).includes(v);

export type ChannelSpec = {
  key: Channel;
  label: string;
  /** One line under the selector, so someone picks the right one first time. */
  hint: string;
  /** Output ceiling. These are short forms; none of them wants an essay. */
  maxTokens: number;
  /** Channel-specific instruction appended to the shared system prompt. */
  guidance: string;
};

export const CHANNEL_SPECS: Record<Channel, ChannelSpec> = {
  linkedin: {
    key: "linkedin",
    label: "LinkedIn post",
    hint: "Public, first person, for the leader's own feed.",
    maxTokens: 700,
    guidance:
      "Write a LinkedIn post of 120–180 words in the first person, as the organization's " +
      "leader. Open on the specific moment, not on the organization. No hashtag salad — at " +
      "most two, only if they are genuinely useful. No emoji. Do not end with a donation ask; " +
      "this post is cultivation, not solicitation.",
  },
  newsletter_section: {
    key: "newsletter_section",
    label: "Newsletter section",
    hint: "One section of an edition, in the org's voice.",
    maxTokens: 700,
    guidance:
      "Write one newsletter section of 100–150 words. Third person, warm, concrete. Lead with " +
      "what changed. It sits among other sections, so do not greet the reader or sign off.",
  },
  thank_you: {
    key: "thank_you",
    label: "Thank-you paragraph",
    hint: "A paragraph to drop into a donor acknowledgment.",
    maxTokens: 500,
    guidance:
      "Write a single paragraph of 60–90 words for a donor thank-you letter, addressed to the " +
      "donor as 'you', showing them what their support made possible. Do not ask for another " +
      "gift. Do not open with 'Thank you' — that line already exists in the letter above this " +
      "paragraph.",
  },
  grant_anecdote: {
    key: "grant_anecdote",
    label: "Grant report anecdote",
    hint: "The illustrative story inside a funder report.",
    maxTokens: 600,
    guidance:
      "Write 80–120 words as an illustrative anecdote inside a grant report. Plain, precise, " +
      "and free of promotional language — a program officer is reading it. Tie the individual " +
      "story to the outcome it evidences. No superlatives.",
  },
  board_update: {
    key: "board_update",
    label: "Board update",
    hint: "A short item for the board packet.",
    maxTokens: 500,
    guidance:
      "Write 60–100 words for a board update. Direct and unsentimental: what happened, what it " +
      "signals about the model working, and anything it implies for the board's attention. No " +
      "marketing voice.",
  },
  news_flash: {
    key: "news_flash",
    label: "News flash",
    hint: "The short between-newsletters send. Should feel like a text.",
    maxTokens: 450,
    guidance:
      "Write 50–90 words as a short standalone email to supporters — the 'I had to tell you " +
      "about this' send between newsletters. It should read like a text message from a person, " +
      "not a bulletin. One idea only. No header, no sign-off.",
  },
  personal_forward: {
    key: "personal_forward",
    label: "Personal note to forward",
    hint: "The line a leader or board member wraps around a forwarded update.",
    maxTokens: 400,
    guidance:
      "Write 40–70 words as a personal note that a board member or the leader would put ABOVE a " +
      "forwarded newsletter when sending it to one supporter they know. Warm, specific, and " +
      "clearly written by a person. Leave a [Name] placeholder for the recipient. No ask.",
  },
};

export const CHANNEL_LIST: ChannelSpec[] = CHANNELS.map((c) => CHANNEL_SPECS[c]);

/**
 * The shared system prompt.
 *
 * The redaction rules are restated here even though redaction already happened
 * in code. Belt and braces: the text arriving in the prompt is already scrubbed,
 * and this stops the model inventing a plausible name to fill the gap — which
 * is its own kind of disclosure problem when the draft is about a real child.
 */
export const COMPOSER_SYSTEM = [
  "You write short-form communications for a small nonprofit, from stories its staff captured.",
  "",
  "Hard rules:",
  "- Use ONLY what the story and the numbers below actually say. Do not add details, dialogue,",
  "  emotions, or context that is not there. If the story is thin, write something short.",
  "- Some people are described by a placeholder such as 'a young person' rather than a name.",
  "  That is deliberate: consent does not cover naming them. Use the placeholder as written.",
  "  NEVER invent a name, initial, age, school, or city for anyone.",
  "- Do not invent numbers. Use only the figures provided, and quote them exactly.",
  "- No em dashes. Write plainly and specifically. Avoid nonprofit boilerplate",
  "  ('we are thrilled', 'making a difference', 'passionate about', 'life-changing').",
  "- Return only the finished text. No preamble, no title, no notes, no options.",
].join("\n");

export type PromptInput = {
  channel: Channel;
  title: string;
  body: string | null;
  outcome: string | null;
  subjectDescriptions: string[];
  metrics: Array<{ name: string; value: number; unit: string | null; captured_on: string | null }>;
  /** The org's own name — safe, and it stops the model writing "the organization". */
  orgName: string;
};

/** Render the user-turn prompt from an ALREADY REDACTED story. */
export function buildComposerPrompt(input: PromptInput): string {
  const parts: string[] = [];
  parts.push(`Organization: ${input.orgName}`);
  parts.push("");
  parts.push("THE STORY");
  parts.push(`Headline: ${input.title}`);
  if (input.body) parts.push(`What happened: ${input.body}`);
  if (input.outcome) parts.push(`What changed: ${input.outcome}`);

  if (input.subjectDescriptions.length > 0) {
    parts.push("");
    parts.push("PEOPLE IN THIS STORY — refer to them exactly as described:");
    for (const d of input.subjectDescriptions) parts.push(`- ${d}`);
  }

  if (input.metrics.length > 0) {
    parts.push("");
    parts.push("NUMBERS YOU MAY USE (exact values, do not round or extrapolate):");
    for (const m of input.metrics) {
      const unit = m.unit ? ` ${m.unit}` : "";
      const asOf = m.captured_on ? ` (as of ${m.captured_on})` : "";
      parts.push(`- ${m.name}: ${m.value}${unit}${asOf}`);
    }
  }

  parts.push("");
  parts.push("WHAT TO WRITE");
  parts.push(CHANNEL_SPECS[input.channel].guidance);
  return parts.join("\n");
}

/** The one-line provenance note shown above every draft (spec §7.5). */
export function provenanceNote(opts: {
  metricCount: number;
  redactionCount: number;
  model: string;
}): string {
  const bits = ["grounded in this story"];
  if (opts.metricCount > 0) {
    bits.push(`plus ${opts.metricCount} metric${opts.metricCount === 1 ? "" : "s"}`);
  }
  bits.push(
    opts.redactionCount > 0
      ? `names redacted (${opts.redactionCount} replaced)`
      : "no names to redact",
  );
  return `${bits.join("; ")} · ${opts.model}`;
}
