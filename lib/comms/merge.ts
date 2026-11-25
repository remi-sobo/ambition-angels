/**
 * Merge fields for campaign emails (specs/comms-v3-composer.md, Phase 1).
 * PURE: the composer preview, the test send, the pre-send check and the
 * worker all call mergeText(), so the preview is the email.
 *
 * Syntax: {{first_name}} or, with the words to use when a person has no
 * value, {{first_name|there}}.
 *
 * Fail closed: a field this file does not know blocks the send (a typo must
 * never reach a donor as raw braces), and a field with no fallback that is
 * empty for anyone blocks it too.
 */

export type MergeData = {
  first_name: string | null;
  last_name: string | null;
  /** Display name: the person's full name, or the organization's name. */
  full_name: string | null;
  /** YYYY-MM-DD of the most recent gift, if any. */
  last_gift: string | null;
  lifetime_total: number | null;
  gift_count: number | null;
};

export type MergeFieldKey = "first_name" | "last_name" | "full_name" | "last_gift_date" | "total_given";

export const MERGE_FIELDS: ReadonlyArray<{
  key: MergeFieldKey;
  label: string;
  /** What the chip inserts. Name fields come with a fallback already. */
  insert: string;
  /** True when only people who have given have a value. */
  givingOnly: boolean;
}> = [
  { key: "first_name", label: "First name", insert: "{{first_name|there}}", givingOnly: false },
  { key: "last_name", label: "Last name", insert: "{{last_name}}", givingOnly: false },
  { key: "full_name", label: "Full name", insert: "{{full_name|friend}}", givingOnly: false },
  { key: "last_gift_date", label: "Last gift date", insert: "{{last_gift_date}}", givingOnly: true },
  { key: "total_given", label: "Total given", insert: "{{total_given}}", givingOnly: true },
];

const KNOWN = new Set<string>(MERGE_FIELDS.map((f) => f.key));
const LABEL = new Map<string, string>(MERGE_FIELDS.map((f) => [f.key, f.label]));

/** Bare {{first_name}} has always fallen back to "friend" (the journeys and
 *  V1 campaigns rely on it). Every other field has no built-in fallback. */
const BUILT_IN_FALLBACK: Partial<Record<MergeFieldKey, string>> = { first_name: "friend" };

// {{ key }} or {{ key | fallback words }}
const TOKEN = /\{\{\s*([^{}|]*?)\s*(?:\|([^{}]*))?\}\}/g;

export const EMPTY_MERGE: MergeData = {
  first_name: null, last_name: null, full_name: null, last_gift: null, lifetime_total: null, gift_count: null,
};

function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatMoney(n: number): string {
  const whole = Math.round(n * 100) % 100 === 0;
  return n.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
  });
}

/** One person's value for a field, or "" when they have none. */
export function fieldValue(key: MergeFieldKey, data: MergeData): string {
  switch (key) {
    case "first_name": return (data.first_name ?? "").trim();
    case "last_name": return (data.last_name ?? "").trim();
    case "full_name": return (data.full_name ?? "").trim();
    case "last_gift_date": return data.last_gift ? formatDate(data.last_gift) : "";
    case "total_given": return data.lifetime_total && data.lifetime_total > 0 ? formatMoney(data.lifetime_total) : "";
  }
}

export type MergeResult = {
  text: string;
  /** Known fields that were empty for this person and had no fallback. */
  missing: MergeFieldKey[];
  /** Known fields that used their fallback words for this person. */
  fellBack: MergeFieldKey[];
};

/** Fill a subject or body for one person. Unknown fields are left as typed:
 *  the pre-send check refuses them, so they never reach a send. */
export function mergeText(text: string, data: MergeData): MergeResult {
  const missing = new Set<MergeFieldKey>();
  const fellBack = new Set<MergeFieldKey>();
  const out = text.replace(TOKEN, (raw, name: string, fallback: string | undefined) => {
    const key = name.toLowerCase();
    if (!KNOWN.has(key)) return raw;
    const k = key as MergeFieldKey;
    const value = fieldValue(k, data);
    if (value) return value;
    const fb = fallback !== undefined ? fallback.trim() : BUILT_IN_FALLBACK[k];
    if (fb === undefined) {
      missing.add(k);
      return "";
    }
    fellBack.add(k);
    return fb;
  });
  return { text: out, missing: Array.from(missing), fellBack: Array.from(fellBack) };
}

export type FieldUse = { key: MergeFieldKey; label: string; fallback: string | null };

/** The fields a text uses, and anything in braces that is not a field. */
export function scanFields(text: string): { used: FieldUse[]; unknown: string[] } {
  const used = new Map<string, FieldUse>();
  const unknown = new Set<string>();
  for (const m of Array.from(text.matchAll(TOKEN))) {
    const key = m[1].toLowerCase();
    if (!KNOWN.has(key)) {
      unknown.add(m[0]);
      continue;
    }
    const k = key as MergeFieldKey;
    const fb = m[2] !== undefined ? m[2].trim() : BUILT_IN_FALLBACK[k] ?? null;
    const id = `${k}|${fb ?? "\u0000"}`;
    if (!used.has(id)) used.set(id, { key: k, label: LABEL.get(k) ?? k, fallback: fb });
  }
  // Leftovers once real tokens are gone: {first_name}, {{first_name}, [First Name].
  const rest = text.replace(TOKEN, "");
  for (const m of Array.from(rest.matchAll(/\{\{?[^{}\n]{0,40}\}?\}|\{\{|\}\}|\[(?:first|last|full)?\s?name\]/gi))) unknown.add(m[0]);
  return { used: Array.from(used.values()), unknown: Array.from(unknown) };
}

export type MergeCheck = {
  /** Things in braces that are not fields. Any one blocks the send. */
  unknown: string[];
  fields: Array<FieldUse & {
    /** People who will see the fallback words instead of their own value. */
    fallbackCount: number;
    /** People with no value and no fallback. Any above zero blocks the send. */
    missingCount: number;
  }>;
  /** Plain sentences for whatever stops the send. Empty means good to go. */
  blockers: string[];
  /** Plain sentences worth a look that do not stop the send. */
  notes: string[];
};

const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;

/** Check a subject and body against everyone who would get it. */
export function checkMerge(subject: string, body: string, recipients: MergeData[]): MergeCheck {
  const scan = scanFields(`${subject}\n${body}`);
  const fields = scan.used.map((f) => {
    let fallbackCount = 0;
    let missingCount = 0;
    for (const r of recipients) {
      if (fieldValue(f.key, r)) continue;
      if (f.fallback === null) missingCount += 1;
      else fallbackCount += 1;
    }
    return { ...f, fallbackCount, missingCount };
  });

  const blockers: string[] = [];
  const notes: string[] = [];
  if (scan.unknown.length) {
    blockers.push(
      `${scan.unknown.slice(0, 3).join(", ")} ${scan.unknown.length === 1 ? "is" : "are"} not a merge field. Fix the spelling or use the buttons above the message.`
    );
  }
  for (const f of fields) {
    if (f.missingCount > 0) {
      blockers.push(
        `${people(f.missingCount)} on this list ${f.missingCount === 1 ? "has" : "have"} no ${f.label.toLowerCase()}. Add words to use instead, like {{${f.key}|your words}}, or pick a list where everyone has one.`
      );
    } else if (f.fallbackCount > 0) {
      notes.push(
        `${people(f.fallbackCount)} ${f.fallbackCount === 1 ? "has" : "have"} no ${f.label.toLowerCase()} and will see "${f.fallback}" instead.`
      );
    }
  }
  return { unknown: scan.unknown, fields, blockers, notes };
}
