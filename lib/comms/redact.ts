/**
 * The redaction boundary (specs/comms-module.md §6.4).
 *
 * ONE RULE, inherited from the SafeSpace work and applied platform-wide:
 * individually identifiable participant data never reaches a model. This
 * module is the only way story text is allowed to enter a Claude API call, and
 * everything it does is recorded so the claim is checkable against a stored
 * row rather than taken on trust.
 *
 * ── The direction of error is deliberate ─────────────────────────────────────
 * Name replacement is case-insensitive and word-bounded, with no cleverness
 * about whether a match "looks like" a name. A participant called Grace or
 * Will means the draft comes back reading a little oddly in places — and a
 * human reads every draft before it goes anywhere. The opposite failure, a
 * minor's real name reaching the model because a heuristic decided a lowercase
 * match was probably the verb, is not recoverable. Over-redact.
 *
 * ── What this cannot do ──────────────────────────────────────────────────────
 * It replaces the names it KNOWS: the subject's display label and, for a linked
 * participant, the names on their record. A nickname nobody recorded, or a
 * surname typed only into free text, will pass through. That residual risk is
 * documented in the spec's failure modes, and it is why the capture and edit
 * screens carry a standing hint to keep names out of the prose in the first
 * place.
 */

import { CONSENT_SCOPES, type ConsentRow, grantedScopes } from "./consent";
import type { SubjectType } from "./stories";

/** What a subject is called in a redacted draft, by type. Neutral, and
 *  readable as prose — the model has to write English around these. */
const PLACEHOLDER: Record<SubjectType, string> = {
  participant: "a participant",
  constituent: "a supporter",
  partner: "a partner organization",
  staff: "a team member",
  none: "someone",
};

const MINOR_PLACEHOLDER = "a young person";

export type RedactableSubject = {
  id: string;
  subject_type: SubjectType | string;
  display_label: string;
  is_minor: boolean;
  consents?: readonly ConsentRow[] | null;
  /** Names from the linked record (students/constituents/partners), looked up
   *  server-side. These are the ones a staffer is most likely to have typed
   *  into the story body without thinking about it. */
  knownNames?: readonly string[];
};

/**
 * May this subject be named to the model?
 *
 * Only when BOTH hold: they are not a minor, and a current consent explicitly
 * covers `full_name`. A `first_name` grant is permission to use a first name
 * in a PUBLISHED piece — it is not permission to hand the name to a model, and
 * the spec draws that line deliberately ("unconditionally when is_minor, and
 * whenever consent scope lacks full_name").
 */
export function mayNameToModel(subject: RedactableSubject, today?: string): boolean {
  if (subject.is_minor) return false;
  const scopes = grantedScopes(subject.consents ?? [], today);
  return scopes.includes("full_name");
}

export function placeholderFor(subject: RedactableSubject): string {
  if (subject.is_minor) return MINOR_PLACEHOLDER;
  const t = subject.subject_type as SubjectType;
  return PLACEHOLDER[t] ?? PLACEHOLDER.none;
}

/** Escape a literal for use inside a RegExp. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "Letter or digit" for word-boundary purposes, as explicit BMP ranges rather
 * than \p{L}\p{N}: the project's tsconfig sets no `target`, so unicode
 * property escapes (which need the `u` flag) don't type-check, and raising the
 * target repo-wide to satisfy one module isn't a trade worth making.
 *
 * \b is not usable here either — it treats the apostrophe in O'Brien and the
 * hyphen in Anne-Marie as boundaries, which is exactly wrong for names.
 *
 * The ranges cover Latin (incl. extended/accented), Greek, Cyrillic, and most
 * other BMP scripts. A name outside them degrades toward MORE replacement, not
 * less, which is the safe direction.
 */
const WORDISH =
  "A-Za-z0-9" +
  "\\u00C0-\\u024F" + // Latin-1 Supplement + Latin Extended-A/B
  "\\u0370-\\u1FFF" + // Greek, Cyrillic, Hebrew, Arabic, Indic, …
  "\\u2C00-\\uD7FF";  // Glagolitic through Hangul

/**
 * Every string we will hunt for, for one subject: the display label, each
 * known name, and each whitespace-separated part of them (so "Marcus Chen"
 * also catches a bare "Chen" later in the paragraph).
 *
 * Single characters are excluded — a lone "J" matches half the alphabet's
 * worth of false positives and redacts nothing anyone could identify.
 */
export function namesToHunt(subject: RedactableSubject): string[] {
  const raw = [subject.display_label, ...(subject.knownNames ?? [])];
  const out = new Set<string>();
  for (const name of raw) {
    if (typeof name !== "string") continue;
    const full = name.trim();
    if (full.length >= 2) out.add(full);
    for (const part of full.split(/\s+/)) {
      const p = part.replace(new RegExp(`[^${WORDISH}'\u2019-]`, "g"), "");
      if (p.length >= 2) out.add(p);
    }
  }
  // Longest first, so "Marcus Chen" is replaced before a bare "Marcus" can
  // eat half of it and leave an orphaned surname behind.
  return Array.from(out).sort((a, b) => b.length - a.length);
}

export type Replacement = { from: string; to: string; count: number };

/**
 * Replace every known name with its placeholder.
 *
 * Word-bounded via lookaround rather than \b, because \b does not behave for
 * names with apostrophes or hyphens (O'Brien, Anne-Marie). Possessives are
 * handled by leaving the trailing 's — "a young person's essay" reads fine.
 */
export function redactNames(
  text: string,
  subjects: readonly RedactableSubject[],
  today?: string,
): { text: string; replacements: Replacement[] } {
  let out = text;
  const replacements: Replacement[] = [];

  for (const subject of subjects) {
    if (mayNameToModel(subject, today)) continue;
    const to = placeholderFor(subject);
    for (const name of namesToHunt(subject)) {
      const re = new RegExp(`(?<![${WORDISH}])${escapeRe(name)}(?![${WORDISH}])`, "gi");
      let count = 0;
      out = out.replace(re, () => {
        count += 1;
        return to;
      });
      if (count > 0) replacements.push({ from: name, to, count });
    }
  }
  return { text: out, replacements };
}

export type GroundingMetric = {
  /** metric_snapshots.id — the snapshot actually sent, not the definition. */
  snapshot_id: string | null;
  metric_id: string;
  name: string;
  value: number;
  unit: string | null;
  captured_on: string | null;
};

export type RedactedStory = {
  title: string;
  body: string | null;
  outcome: string | null;
  /** How the model is told to refer to each person, in prose. */
  subjectDescriptions: string[];
  metrics: GroundingMetric[];
};

export type Grounding = {
  story_id: string;
  /** Which story fields were sent. */
  fields: string[];
  /** Metric snapshots resolved server-side and rendered into the prompt. */
  metric_snapshot_ids: string[];
  metrics: GroundingMetric[];
  /** Every name → placeholder swap, with how many times it fired. */
  redactions: Replacement[];
  /** Subjects present on the story and whether each was nameable. */
  subjects: Array<{ id: string; type: string; redacted: boolean; is_minor: boolean }>;
  /** Always true in v1: no image ever goes to the model. */
  media_excluded: true;
};

export type StoryForModel = {
  id: string;
  title: string;
  body: string | null;
  outcome: string | null;
};

/**
 * Turn a story into the only shape allowed to enter a model call.
 *
 * Media is dropped outright — v1 sends no images, so a photo whose EXIF we
 * stripped never becomes a second disclosure path. Metric values are resolved
 * here and rendered as flat prose, so the model sees "47 teens served this
 * quarter" and never a capability to query anything.
 */
export function redactStoryForModel(
  story: StoryForModel,
  subjects: readonly RedactableSubject[],
  metrics: readonly GroundingMetric[] = [],
  today?: string,
): { redacted: RedactedStory; grounding: Grounding } {
  const all: Replacement[] = [];
  const scrub = (text: string | null): string | null => {
    if (!text) return null;
    const r = redactNames(text, subjects, today);
    all.push(...r.replacements);
    return r.text;
  };

  const title = scrub(story.title) ?? "";
  const body = scrub(story.body);
  const outcome = scrub(story.outcome);

  const subjectDescriptions = subjects
    .filter((s) => s.subject_type !== "none")
    .map((s) =>
      mayNameToModel(s, today)
        ? `${s.display_label} (${s.subject_type}, named with consent)`
        : `${placeholderFor(s)} — refer to them ONLY this way, never invent a name`,
    );

  const fields = ["title"];
  if (body) fields.push("body");
  if (outcome) fields.push("outcome");

  return {
    redacted: { title, body, outcome, subjectDescriptions, metrics: [...metrics] },
    grounding: {
      story_id: story.id,
      fields,
      metric_snapshot_ids: metrics.map((m) => m.snapshot_id).filter((v): v is string => !!v),
      metrics: [...metrics],
      // Merge duplicates so the audit line reads once per name, with a total.
      redactions: Object.values(
        all.reduce<Record<string, Replacement>>((acc, r) => {
          const key = `${r.from}→${r.to}`;
          acc[key] = acc[key] ? { ...acc[key], count: acc[key].count + r.count } : { ...r };
          return acc;
        }, {}),
      ),
      subjects: subjects.map((s) => ({
        id: s.id,
        type: s.subject_type,
        redacted: !mayNameToModel(s, today),
        is_minor: s.is_minor,
      })),
      media_excluded: true,
    },
  };
}

/**
 * A last-line assertion for the route: does the text we are about to send
 * still contain any name we were supposed to remove?
 *
 * The route treats a true here as a hard failure — no draft, no model call.
 * It should be unreachable; it exists so that if redactNames is ever broken by
 * an edit, the result is a 500 and a log line rather than a child's name in a
 * request body.
 */
export function leaksAnyName(
  text: string,
  subjects: readonly RedactableSubject[],
  today?: string,
): string | null {
  for (const subject of subjects) {
    if (mayNameToModel(subject, today)) continue;
    for (const name of namesToHunt(subject)) {
      const re = new RegExp(`(?<![${WORDISH}])${escapeRe(name)}(?![${WORDISH}])`, "i");
      if (re.test(text)) return name;
    }
  }
  return null;
}

/** The scope vocabulary, re-exported so prompt builders can describe what a
 *  consent actually permits without importing two modules. */
export { CONSENT_SCOPES };
