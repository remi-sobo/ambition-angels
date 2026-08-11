/**
 * Play-pool eligibility (specs/teen-games-v1.md Phase 1).
 *
 * The rules that keep a round fair, applied twice on purpose: the admin
 * review screen uses them to sort candidates from blocked rows, and the
 * approve route re-checks them server-side so a stale screen can't flip an
 * unfair occupation eligible. Deterministic string/number checks only — no
 * model anywhere near the pool (locked decision 3).
 *
 * Selection helpers (the Higher Wage gap rule, daily scheduling) land with
 * their games in later phases; this module is only the gate.
 */

export type PoolCandidate = {
  soc_code: string;
  title: string;
  description: string | null;
  pay_median: number | null;
};

/**
 * SOC catch-all buckets ("Managers, All Other"; "Miscellaneous Assemblers
 * and Fabricators") aggregate everything the taxonomy couldn't place. Their
 * pay figure describes no real job a teen could look up, so they never
 * reach a game.
 */
export function isCatchAllTitle(title: string): boolean {
  return /,\s*all other$/i.test(title.trim()) || /^(all other|miscellaneous)\b/i.test(title.trim());
}

/** Reveal lines stay one short spoken sentence — a projector line, not a bio. */
export const REVEAL_LINE_MAX = 140;

/**
 * Why an occupation can't be flipped eligible, in the words the review
 * screen shows. Empty array = clean candidate. Mirrors the Phase 1
 * definition of done: non-null pay median, not a SOC catch-all, and enough
 * description to write an honest reveal line from.
 */
export function eligibilityIssues(occ: PoolCandidate): string[] {
  const issues: string[] = [];
  if (occ.pay_median == null || occ.pay_median <= 0) issues.push("no pay data");
  if (isCatchAllTitle(occ.title)) issues.push("SOC catch-all bucket");
  if (!occ.description || occ.description.trim().length < 40) issues.push("no usable description");
  return issues;
}

/**
 * Prefill for the reveal line: the first sentence of the O*NET description,
 * clipped to a word boundary. A starting point for the human edit, never
 * the final word — the approve route requires a human stamp regardless.
 */
export function draftRevealLine(description: string | null): string {
  if (!description) return "";
  const first = description.trim().split(/(?<=[.!?])\s/)[0]?.replace(/[.!?]+$/, "") ?? "";
  if (first.length <= REVEAL_LINE_MAX) return first;
  const cut = first.slice(0, REVEAL_LINE_MAX + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).trimEnd() + "…";
}
