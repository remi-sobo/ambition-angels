import { generateStructured } from "@/lib/ai/gateway";
import { FEW_SHOT_CARDS } from "./fewshot";
import { renderClue6, renderClue7, type PayFacts } from "./render";
import { runGates, type GateResult } from "./gates";

/**
 * The card generator (specs/ms-career-library-v2.md "The generation
 * pipeline"). Offline batch tool for /admin/careers — low volume, high
 * stakes, so it runs on the deep tier, never the fast one.
 *
 * The model writes the vignette, clues 1–5, and clue 8. Clues 6 and 7 are
 * rendered from ms_occupations by lib/ms/render.ts — the model is never
 * asked for a number, so it cannot hallucinate one. Every draft is machine-
 * gated here; approval is a human click in the review UI, never this code.
 */

export type OccupationInput = {
  socCode: string;
  title: string;
  titleVariants: string[];
  description: string | null;
  tasks: string[];
  jobZone: number;
  payMedian: number | null;
  payP90: number | null;
  payAsOf: string;
  educationTypical: string | null;
};

export type GeneratedCard = {
  field: string;
  dayVignette: string;
  clue1: string;
  clue2: string;
  clue3: string;
  clue4: string;
  clue5: string;
  clue6: string; // rendered, not generated
  clue7: string; // rendered, not generated
  clue8: string;
  model: string;
  gates: GateResult;
};

const CARD_TOOL = {
  name: "submit_career_card",
  description: "Submit the drafted career card for machine gating and human review.",
  input_schema: {
    type: "object",
    properties: {
      day_vignette: {
        type: "string",
        description:
          "~150 words, first person, present tense, six to eight beats of a real workday with times on them. Never names the job, the industry, an employer, or a credential. Grade 5 reading level.",
      },
      clue_1: {
        type: "string",
        description:
          "The problem I solve. Why anyone pays for this at all. Hardest clue — must be true of at least a dozen jobs. No job title, no industry word.",
      },
      clue_2: { type: "string", description: "What I actually do all day. One sentence, no jargon, no tool names." },
      clue_3: { type: "string", description: "Three skills that matter. The real ones, not 'hard work'." },
      clue_4: { type: "string", description: "Who is counting on me. Who is worse off if I do this badly today." },
      clue_5: { type: "string", description: "Where I work. Industry and setting: hospital, studio, warehouse, office, outside." },
      clue_8: {
        type: "string",
        description:
          "The thing nobody knows. The near-giveaway with a specific, concrete detail that makes a kid say 'wait, WHAT'. Still never contains the job title.",
      },
      field: {
        type: "string",
        enum: ["business", "tech", "health", "creative", "trades", "public"],
        description: "The field this occupation belongs to.",
      },
    },
    required: ["day_vignette", "clue_1", "clue_2", "clue_3", "clue_4", "clue_5", "clue_8", "field"],
  },
} as const;

function buildSystemPrompt(): string {
  const examples = FEW_SHOT_CARDS.map(
    (c, i) => `## Example ${i + 1} (the answer was: ${c.title})

THE DAY:
${c.dayVignette}

Clue 1 (the problem I solve): ${c.clue1}
Clue 2 (what I do all day): ${c.clue2}
Clue 3 (three skills that matter): ${c.clue3}
Clue 4 (who is counting on me): ${c.clue4}
Clue 5 (where I work): ${c.clue5}
Clue 8 (the thing nobody knows): ${c.clue8}`
  ).join("\n\n");

  return `You write career cards for a guessing game played by 11-to-14 year olds. A student privately reads THE DAY, then reads the clues out loud one at a time while their table guesses the job. The fewer clues it takes, the better the round. The job title is the answer and appears NOWHERE in what you write.

Hard rules:
- THE DAY: ~150 words, first person, present tense, six to eight beats of a real workday with clock times. Names no job, no industry, no employer, no credential. Grade 5 reading level: short sentences, plain words. It exists so the student understands the work before they have to talk about it.
- The clues are a ladder from vague to giveaway. Clue 1 must be so abstract it could be a dozen different jobs. Clue 5 narrows hard (industry and setting). Clue 8 is nearly impossible to miss — one specific, concrete, true detail that makes a kid say "wait, WHAT" — but still never the title.
- Never write a salary, a wage, a pay figure, or an education requirement. Those clues are rendered from government data by the system, not by you.
- No emoji. No exclamation-point enthusiasm. Do not write like an adult trying to be fun — a 13 year old can smell that from across the room. Write plain and true.
- Everything must be factually true of the real occupation described in the user message. Ground the beats in the real tasks provided.

These hand-written cards are the standard. Match their shape, their restraint, and their reading level:

${examples}`;
}

function buildUserPrompt(occ: OccupationInput): string {
  return [
    `Write the card for this occupation. Remember: the title never appears in anything you write.`,
    ``,
    `Title (the answer — never write it): ${occ.title}`,
    occ.titleVariants.length ? `Also known as (never write these either): ${occ.titleVariants.join(", ")}` : ``,
    ``,
    `What the occupation is: ${occ.description ?? "(no description imported)"}`,
    ``,
    `Real tasks from the U.S. Department of Labor (ground THE DAY in these):`,
    ...occ.tasks.slice(0, 8).map((t) => `- ${t}`),
    ``,
    `Context you may use for plausibility but must not restate as numbers: this job typically requires ${
      occ.educationTypical ?? `Job Zone ${occ.jobZone} preparation`
    }.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * One generation attempt: deep-tier structured call, then clues 6–7 rendered
 * from data, then the machine gates. Returns the draft with its gate result;
 * the caller decides whether to retry, store, or surface failures.
 */
export async function generateCard(occ: OccupationInput): Promise<GeneratedCard> {
  const { input, model } = await generateStructured({
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(occ),
    tier: "deep",
    maxTokens: 1400, // vignette + six clues; a tighter ceiling keeps the wait ~30s

    tool: CARD_TOOL,
  });

  if (!input || typeof input !== "object") {
    throw new Error("Card generation returned no tool call");
  }
  const raw = input as Record<string, unknown>;
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");

  const payFacts: PayFacts = {
    payMedian: occ.payMedian,
    payP90: occ.payP90,
    payAsOf: occ.payAsOf,
    educationTypical: occ.educationTypical,
    jobZone: occ.jobZone,
  };

  const card = {
    field: str("field"),
    dayVignette: str("day_vignette"),
    clue1: str("clue_1"),
    clue2: str("clue_2"),
    clue3: str("clue_3"),
    clue4: str("clue_4"),
    clue5: str("clue_5"),
    clue6: renderClue6(payFacts),
    clue7: renderClue7(payFacts),
    clue8: str("clue_8"),
  };

  const gates = runGates({
    title: occ.title,
    titleVariants: occ.titleVariants,
    field: card.field || null,
    dayVignette: card.dayVignette,
    clues: [card.clue1, card.clue2, card.clue3, card.clue4, card.clue5, card.clue6, card.clue7, card.clue8],
    payMedian: occ.payMedian,
  });

  return { ...card, model, gates };
}
