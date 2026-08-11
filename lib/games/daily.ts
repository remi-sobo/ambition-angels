/**
 * Server half of the daily game (specs/teen-games-v1.md Phase 4): answer
 * hashing and the scheduling rule. node:crypto lives here, never in
 * lib/games/guess.ts, which client components import.
 */

import { createHash } from "crypto";
import { canonicalAnswer } from "./guess";

export const hashAnswer = (canonical: string): string =>
  createHash("sha256").update(canonical).digest("hex");

/**
 * The hash set the daily route ships to the browser: title and every
 * variant, canonicalized. The client hashes the canonicalized guess and
 * looks it up — the title itself never rides along.
 */
export function acceptedHashes(title: string, variants: string[]): string[] {
  const set = new Set<string>();
  for (const s of [title, ...variants]) {
    const canonical = canonicalAnswer(s);
    if (canonical) set.add(hashAnswer(canonical));
  }
  return Array.from(set);
}

/** Job zone 3 or lower = reachable without a four-year degree. */
export const LOW_ZONE_MAX = 3;
export const LOW_ZONE_PER_WEEK = 3;

/**
 * The pacing rule, enforced on save in the admin scheduler: every fully
 * scheduled run of seven consecutive days must carry at least three jobs
 * at job zone 3 or lower — otherwise the calendar drifts
 * interesting-to-adults and the reveal lands as "a thing you will never
 * be" (a named failure mode). Returns the first violated window, or null.
 */
export function lowZoneViolation(
  zonesByDay: Map<string, number>,
  aroundDay: string
): { start: string; end: string; lowCount: number } | null {
  const dayMs = 86_400_000;
  const base = Date.parse(aroundDay);
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  for (let offset = -6; offset <= 0; offset++) {
    const days = Array.from({ length: 7 }, (_, i) => iso(base + (offset + i) * dayMs));
    const zones = days.map((d) => zonesByDay.get(d));
    if (zones.some((z) => z === undefined)) continue; // window not fully scheduled yet
    const lowCount = zones.filter((z) => z! <= LOW_ZONE_MAX).length;
    if (lowCount < LOW_ZONE_PER_WEEK) {
      return { start: days[0], end: days[6], lowCount };
    }
  }
  return null;
}
