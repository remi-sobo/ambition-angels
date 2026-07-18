/**
 * Generic starter template (strategy builders, spec #6 F3).
 *
 * Four universal nonprofit pillars a brand-new org can load as its objective
 * skeleton and then rename/edit — the wizard's gap engine drives goals and
 * measures from there. Titles are real (safe to keep); the 3-year statements
 * are bracketed prompts, which the completeness rules treat as unedited
 * placeholders. Deliberately tenant-neutral: no AA content anywhere.
 */

export type StarterObjective = { title: string; statement: string };

export const STARTER_OBJECTIVES: StarterObjective[] = [
  {
    title: "Deliver an impactful program",
    statement:
      "[What outcomes does your program produce, for whom, and how will you know? Write the 3-year picture in one or two sentences.]",
  },
  {
    title: "Fund the mission sustainably",
    statement:
      "[What does full-budget coverage look like — which revenue mix, what floor must be raised, what does a healthy runway mean for you?]",
  },
  {
    title: "Grow reach and partnerships",
    statement:
      "[Who else delivers your mission with you — schools, partners, volunteers — and what does that network look like at scale?]",
  },
  {
    title: "Build a durable organization",
    statement:
      "[Board, team, systems, compliance — what has to be true so the organization runs well and isn't dependent on any one person?]",
  },
];
