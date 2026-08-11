/**
 * Guess matching and day math for Never Heard of It (specs/teen-games-v1.md
 * Phase 4). Client-safe on purpose — the browser imports this to normalize
 * a typed guess exactly the way the server normalized the accepted
 * answers, so matching is a hash comparison and a wrong guess costs no
 * round trip (and the guess itself never leaves the phone: the one place
 * a student types free text, nothing is transmitted or stored).
 */

/** Day zero. Day numbers in the share block count from here. */
export const DAILY_EPOCH = "2026-08-10";

/**
 * Today's date where the game says it is. The day rolls at midnight
 * Pacific, not UTC (Phase 4 definition of done) — en-CA gives YYYY-MM-DD.
 */
export function laDateString(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export function dayNumber(dateStr: string): number {
  return Math.round((Date.parse(dateStr) - Date.parse(DAILY_EPOCH)) / 86_400_000);
}

/** Lowercase, strip accents and everything that isn't a letter or digit. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The canonical comparison form: normalized, minus one trailing "s" (but
 * not "ss") so "surgical technologist" matches "Surgical Technologists"
 * and "EMTs" matches "EMT". Both sides — accepted answers and the typed
 * guess — pass through this, so the transform can be lossy as long as it
 * is identical.
 */
export function canonicalAnswer(s: string): string {
  const n = normalizeAnswer(s);
  // No regex lookbehind here — older mobile Safari throws at parse time,
  // and this file ships to phones.
  return n.endsWith("s") && !n.endsWith("ss") ? n.slice(0, -1) : n;
}
