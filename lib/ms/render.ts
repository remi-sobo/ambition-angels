/**
 * Clues 6 and 7 are RENDERED from imported data, never generated
 * (specs/ms-career-library-v2.md: "The model never touches a number").
 *
 * This module is the single source of those sentences. The generation
 * pipeline writes them onto the card at draft time so Remi reviews exactly
 * what a student will read, and scripts/import-onet.ts re-renders them on
 * annual re-import so a card's pay never goes stale while its reviewed
 * prose stays intact.
 */

export type PayFacts = {
  payMedian: number | null;
  payP90: number | null;
  payAsOf: string; // "May 2024"
  educationTypical: string | null;
  jobZone: number;
};

/**
 * The anchor every kid's number is compared against: the national median
 * annual wage across all occupations, BLS OEWS. Update alongside the annual
 * re-import; the import script warns when occupation vintages drift from
 * this one. Source: bls.gov/oes (May 2024 release), all occupations (00-0000).
 */
export const NATIONAL_MEDIAN = { value: 49500, asOf: "May 2024" } as const;

export function fmtUsd(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/**
 * Clue 6 — "How you get here." The honest path, in grade-5 words. Uses the
 * BLS typical-entry-education text when the import supplied it; otherwise
 * falls back to the O*NET Job Zone, which encodes the same fact more
 * coarsely. Job Zones 1–3 say out loud that no four-year degree is needed,
 * because that is the sentence the product exists to say.
 */
export function renderClue6(facts: PayFacts): string {
  if (facts.educationTypical) {
    const edu = facts.educationTypical.trim().replace(/\.$/, "");
    const noDegree = facts.jobZone <= 3 ? " No four-year degree." : "";
    return `${edu}.${noDegree}`;
  }
  switch (facts.jobZone) {
    case 1:
      return "No degree needed. You can start right after high school, sometimes before.";
    case 2:
      return "A high school diploma and training on the job. No four-year degree.";
    case 3:
      return "A certificate or a two-year degree, usually from a community college. No four-year degree.";
    case 4:
      return "A four-year college degree.";
    default:
      return "A four-year college degree, then more school after it.";
  }
}

/**
 * Clue 7 — "What it pays." Real BLS figures with the national anchor,
 * matching the shape of the hand-written v1 cards: median first, top ten
 * percent when we have it, then the typical-American-worker anchor.
 */
export function renderClue7(facts: PayFacts): string {
  if (facts.payMedian == null) {
    // A card should not ship without pay (definition of done: every pay
    // figure resolves to a BLS source) — the gates reject this, but the
    // renderer stays total so drafts can exist while data is pending.
    return `Pay data is still being verified. The typical American worker makes ${fmtUsd(NATIONAL_MEDIAN.value)}.`;
  }
  const median = `Half of us make more than ${fmtUsd(facts.payMedian)}.`;
  const p90 =
    facts.payP90 != null ? ` The top ten percent make over ${fmtUsd(facts.payP90)}.` : "";
  const anchor = ` The typical American worker makes ${fmtUsd(NATIONAL_MEDIAN.value)}.`;
  return median + p90 + anchor;
}
