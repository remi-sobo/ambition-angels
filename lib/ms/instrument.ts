import type { TraitKey, TraitProfile } from "./riasec";

/**
 * The /ms instrument (specs/ms-instrument-v1.md — DRAFT content, D9).
 *
 * 30 work activities, one per screen, tap-only, grade 5, five per RIASEC
 * dimension. The student answers "Would you want to spend a day doing
 * this?" on a five-point scale. Sum by dimension → the trait profile. No
 * free text exists anywhere in this flow, by construction.
 *
 * The item TEXT is content with the same review bar as the cards: Remi
 * edits it here (and in the spec doc) before launch. The structure —
 * 30 items, balanced 5 per dimension — is enforced by tests/ms-instrument
 * so an edit cannot silently unbalance the profile.
 */

export type InstrumentItem = {
  id: number;
  trait: TraitKey;
  text: string;
};

/** Tap options, in display order. The index (0–4) is the score. */
export const SCALE = ["No way", "Not really", "Maybe", "I'd like that", "I'd love that"] as const;

export const QUESTION = "Would you want to spend a day doing this?";

export const ITEMS: InstrumentItem[] = [
  // Build (Realistic)
  { id: 1, trait: "build", text: "Fix a bike that stopped working, and figure out what was wrong." },
  { id: 2, trait: "build", text: "Build a treehouse from a pile of boards." },
  { id: 3, trait: "build", text: "Take something apart just to see what is inside it." },
  { id: 4, trait: "build", text: "Plant a garden and take care of it all summer." },
  { id: 5, trait: "build", text: "Put together furniture from the instructions, and get it right." },
  // Analyze (Investigative)
  { id: 6, trait: "analyze", text: "Figure out why a plant died when the one next to it lived." },
  { id: 7, trait: "analyze", text: "Do a science experiment to see if something you believe is really true." },
  { id: 8, trait: "analyze", text: "Solve a mystery using clues nobody else noticed." },
  { id: 9, trait: "analyze", text: "Watch a video about how volcanoes work, on purpose, for fun." },
  { id: 10, trait: "analyze", text: "Keep testing a game until you find the exact spot where it breaks." },
  // Create (Artistic)
  { id: 11, trait: "create", text: "Make up a story and tell it so well people want to hear it again." },
  { id: 12, trait: "create", text: "Design the cover for an album or a game." },
  { id: 13, trait: "create", text: "Make a video and edit it until it feels exactly right." },
  { id: 14, trait: "create", text: "Write a song about something that happened to you." },
  { id: 15, trait: "create", text: "Turn a plain room into one that looks amazing." },
  // Help (Social)
  { id: 16, trait: "help", text: "Teach a little kid to read." },
  { id: 17, trait: "help", text: "Sit with somebody at lunch who is having a bad day." },
  { id: 18, trait: "help", text: "Show a new student around so they are not lost on day one." },
  { id: 19, trait: "help", text: "Help your grandmother figure out her phone without making her feel bad." },
  { id: 20, trait: "help", text: "Coach younger kids on a team and watch them get better." },
  // Lead (Enterprising)
  { id: 21, trait: "lead", text: "Talk your friends into doing your plan for the weekend." },
  { id: 22, trait: "lead", text: "Run a bake sale: set the prices, make the signs, count the money." },
  { id: 23, trait: "lead", text: "Be the captain who decides who plays where." },
  { id: 24, trait: "lead", text: "Convince an adult to change their mind about something, politely." },
  { id: 25, trait: "lead", text: "Start a club at school and get people to actually show up." },
  // Organize (Conventional)
  { id: 26, trait: "organize", text: "Organize your whole room so everything has a spot." },
  { id: 27, trait: "organize", text: "Keep score for a tournament and never lose track." },
  { id: 28, trait: "organize", text: "Make the packing list for a trip so nothing gets forgotten." },
  { id: 29, trait: "organize", text: "Sort a huge messy playlist into perfect order." },
  { id: 30, trait: "organize", text: "Plan a party: the list, the schedule, who brings what." },
];

export const MAX_ANSWER = SCALE.length - 1;

/**
 * Turn the 30 tap answers (index-aligned with ITEMS, each 0–4) into the
 * six trait sums. Throws on anything malformed — the API route maps that
 * to a 400; nothing partial ever reaches the scorer or the database.
 */
export function answersToTraits(answers: unknown): TraitProfile {
  if (!Array.isArray(answers) || answers.length !== ITEMS.length) {
    throw new Error(`Expected ${ITEMS.length} answers`);
  }
  const totals: TraitProfile = { build: 0, analyze: 0, create: 0, help: 0, lead: 0, organize: 0 };
  answers.forEach((a, i) => {
    if (typeof a !== "number" || !Number.isInteger(a) || a < 0 || a > MAX_ANSWER) {
      throw new Error(`Answer ${i + 1} out of range`);
    }
    totals[ITEMS[i].trait] += a;
  });
  return totals;
}
