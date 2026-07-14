import { generateText } from "@/lib/ai/gateway";
import type { TraitProfile } from "./riasec";

/**
 * The "what you're built for" summary (Phase 6, locked decision 8: one of
 * exactly two live model calls in the product). Three sentences, second
 * person, strengths only. Most delightful, least load-bearing — a failure
 * returns null and the results page simply renders without it.
 *
 * Safety is structural, not hopeful (failure mode: "the AI summary says
 * something a 12 year old carries around"):
 *   - the input is six numbers and up to three career titles — no free
 *     text from a child exists to send;
 *   - the system prompt forbids deficit language by construction;
 *   - scripts/preview-ms-summaries.ts generates sample outputs for human
 *     review before this ever meets a student.
 */

export const SUMMARY_SYSTEM_PROMPT = [
  "You write a three-sentence note to a middle schooler (11-14) who just finished a career interest assessment. Second person, present tense, grade 5 reading level.",
  "Rules, all hard:",
  "- Exactly three sentences.",
  "- Strengths only. Never name a weakness, a deficit, or what they are 'not'. Never compare them to other kids. Phrases like 'you're not', 'you struggle', 'unlike others', 'you should work on' are forbidden.",
  "- Describe how they are wired using their strongest traits. You may nod at the kinds of work that fit, but never command a career ('you should become...' is forbidden).",
  "- No emoji, no exclamation marks, no hype words like 'awesome'. Plain, warm, true. A 13 year old can smell an adult trying to be fun from across the room.",
  "- Do not mention the assessment, scores, numbers, or percentiles. Just tell them what you see.",
].join("\n");

const TRAIT_MEANINGS: Record<keyof TraitProfile, string> = {
  build: "making real things work",
  analyze: "figuring out why things happen",
  create: "making things that didn't exist before",
  help: "being the person someone needs",
  lead: "deciding and bringing people along",
  organize: "keeping order and never losing track",
};

export function buildSummaryPrompt(traits: TraitProfile, topCareerTitles: string[]): string {
  const orderedTraits = (Object.entries(traits) as [keyof TraitProfile, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([trait]) => `${trait} (${TRAIT_MEANINGS[trait]})`);
  return [
    `Their three strongest traits, strongest first: ${orderedTraits.join("; ")}.`,
    topCareerTitles.length
      ? `Work that matches how they're wired includes: ${topCareerTitles.slice(0, 3).join(", ")}.`
      : "",
    "Write the three sentences.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Returns the summary, or null — never throws into the session path. */
export async function generateSummary(
  traits: TraitProfile,
  topCareerTitles: string[]
): Promise<string | null> {
  try {
    const { text } = await generateText({
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: buildSummaryPrompt(traits, topCareerTitles),
      tier: "fast",
      maxTokens: 300,
    });
    const cleaned = text.trim();
    // Cheap structural checks; a malformed output is dropped, not shown.
    if (!cleaned || cleaned.length > 600) return null;
    if (/you're not|you are not|weakness|struggle|should work on/i.test(cleaned)) return null;
    return cleaned;
  } catch (err) {
    console.error("ms summary: generation failed (results render without it):", err);
    return null;
  }
}
