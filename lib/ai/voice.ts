/**
 * Shared voice utility — one sweep for every AI boundary.
 *
 * The playbook's voice rule (no em dashes, owned vocabulary) belongs in ONE
 * place so every surface that emits model text to a human runs the same repair,
 * instead of each call site reinventing it. This generalizes the inline
 * em-dash strip that used to live only in the Gigi decision route
 * (app/api/shannon/route.ts).
 *
 * - `cleanVoiceText` repairs a single string.
 * - `cleanVoiceDeep` walks an object/array and repairs every string leaf,
 *   leaving structure, numbers, booleans, and nulls untouched. Safe to run on
 *   structured tool output before persisting.
 * - `violatesVoice` reports whether a string still breaks the rule (for tests
 *   and future evals).
 *
 * The em/en dash to comma-pause behavior is kept byte-identical to the prior
 * `stripEmDashes` so existing output does not change. A literal hyphen-minus is
 * deliberately NOT touched, so hyphenated words and numeric ranges
 * ("$50,000-$70,000") survive.
 */

const EM_DASH_RE = /\s*[—–]\s*/g;
const DOUBLE_COMMA_RE = /,\s*,/g;

/** Repair one string: em/en dashes become a comma-pause. */
export function cleanVoiceText(input: string): string {
  if (!input) return input;
  return input.replace(EM_DASH_RE, ", ").replace(DOUBLE_COMMA_RE, ",");
}

/** True when the string still contains an em or en dash. */
export function violatesVoice(input: string): boolean {
  if (!input) return false;
  return /[—–]/.test(input);
}

/**
 * Recursively repair every string leaf in a value, preserving structure.
 * Numbers, booleans, null, and undefined pass through unchanged.
 */
export function cleanVoiceDeep<T>(value: T): T {
  if (typeof value === "string") {
    return cleanVoiceText(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => cleanVoiceDeep(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = cleanVoiceDeep(v);
    }
    return out as T;
  }
  return value;
}
