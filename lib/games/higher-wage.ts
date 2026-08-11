/**
 * Higher Wage selection (specs/teen-games-v1.md Phase 3).
 *
 * The gap rule starts wide and tightens with the streak, and it is banded
 * on both ends on purpose. Too small a gap early is a coin flip that kills
 * a new player in two rounds; an unbounded gap serves "Cardiothoracic
 * Surgeon vs. Fast Food Cook", which is the named failure mode "the pool
 * is boring and the game is unfair" — a teen quits a game that insults
 * her. Deterministic given the rng, which the tests inject. Zero model
 * calls anywhere in this file or its callers (locked decision 3).
 */

import { shuffle } from "@/lib/ms/room";

export type PoolPlayRow = {
  soc_code: string;
  title: string;
  reveal_line: string;
  pay_median: number;
};

/** What the pair response is allowed to carry. No pay, structurally. */
export type PairCard = {
  soc: string;
  title: string;
  reveal: string;
};

export type GapBand = { min: number; max: number };

/**
 * Ratio of the higher pay to the lower. Early rounds are meant to be won
 * (wide but bounded gap); by streak 15 the pairs are genuinely hard calls.
 */
export function gapBandForStreak(streak: number): GapBand {
  if (streak < 5) return { min: 1.5, max: 4.0 };
  if (streak < 10) return { min: 1.3, max: 2.5 };
  if (streak < 15) return { min: 1.15, max: 1.8 };
  return { min: 1.05, max: 1.5 };
}

const ratio = (x: PoolPlayRow, y: PoolPlayRow) =>
  Math.max(x.pay_median, y.pay_median) / Math.min(x.pay_median, y.pay_median);

/**
 * Deal a pair for this streak level. Excluded SOC codes (already seen this
 * run — the 20-rounds/40-distinct-jobs guarantee) are dropped first; if
 * that starves the deck, the exclusion is released rather than the game
 * ending — with a small pool a late repeat beats a dead screen. Within the
 * candidate set: first pair in shuffled order inside the band, else the
 * pair closest to the band with any real gap at all. Null only when no two
 * rows have distinct pay.
 */
export function pickPair(
  rows: PoolPlayRow[],
  streak: number,
  exclude: string[] = [],
  rng: () => number = Math.random
): { a: PoolPlayRow; b: PoolPlayRow } | null {
  const excluded = new Set(exclude);
  let deck = rows.filter((r) => !excluded.has(r.soc_code));
  if (deck.length < 2) deck = rows;
  if (deck.length < 2) return null;

  const band = gapBandForStreak(streak);
  const shuffled = shuffle(deck, rng);

  let fallback: { a: PoolPlayRow; b: PoolPlayRow; distance: number } | null = null;
  for (let i = 0; i < shuffled.length; i++) {
    for (let j = i + 1; j < shuffled.length; j++) {
      const a = shuffled[i];
      const b = shuffled[j];
      if (a.pay_median === b.pay_median) continue;
      const r = ratio(a, b);
      if (r >= band.min && r <= band.max) return { a, b };
      const distance = r < band.min ? band.min - r : r - band.max;
      if (!fallback || distance < fallback.distance) fallback = { a, b, distance };
    }
  }
  return fallback ? { a: fallback.a, b: fallback.b } : null;
}

/**
 * The pre-tap response body, built by allowlist. This function is the
 * subject of the CI leak test: whatever lands in the row objects upstream,
 * only soc/title/reveal survive into the network response.
 */
export function toPairCard(row: PoolPlayRow): PairCard {
  return { soc: row.soc_code, title: row.title, reveal: row.reveal_line };
}
