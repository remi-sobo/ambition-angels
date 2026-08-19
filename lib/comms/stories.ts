/**
 * Story bank vocabulary and shaping rules (specs/comms-module.md §6.1).
 *
 * Pure — no server imports — so routes, tests, and the Phase 2 UI share one
 * definition of what a story is and what may be said about the person in it.
 */

import {
  subjectConsentState,
  type ConsentRow,
  type ConsentState,
  todayISO,
} from "./consent";

export const STORY_STATUSES = ["raw", "drafted", "approved", "used", "retired"] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];
export const isStoryStatus = (v: unknown): v is StoryStatus =>
  typeof v === "string" && (STORY_STATUSES as readonly string[]).includes(v);

export const STORY_SOURCES = ["manual", "reed", "import"] as const;
export type StorySource = (typeof STORY_SOURCES)[number];

export const SUBJECT_TYPES = ["participant", "constituent", "partner", "staff", "none"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];
export const isSubjectType = (v: unknown): v is SubjectType =>
  typeof v === "string" && (SUBJECT_TYPES as readonly string[]).includes(v);

/**
 * Where a subject_id points, by type. The column is polymorphic with no hard
 * FK (the acknowledgments v2 pattern), so THIS is the validation — the API
 * reads the target through the session client before writing, which proves
 * both that it exists and that it lives in the caller's org.
 *
 * `participant` deliberately resolves to `students` rather than being named
 * for it: when the participant spine generalizes that table, only this map
 * changes, and no migration is needed.
 */
export const SUBJECT_TABLE: Record<Exclude<SubjectType, "none">, string> = {
  participant: "students",
  constituent: "constituents",
  partner: "partners",
  staff: "staff",
};

/** Caps, so a paste of a whole Google Doc can't become a row. */
export const MAX_TITLE = 200;
export const MAX_BODY = 8000;
export const MAX_OUTCOME = 2000;
export const MAX_LABEL = 120;
export const MAX_TAGS = 12;
export const MAX_TAG_LEN = 40;

/** Tags are lowercased, trimmed, deduped, and capped. A tag is a filter, not
 *  prose — normalizing here keeps "Demo Day" and "demo day" one chip. */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().toLowerCase().slice(0, MAX_TAG_LEN);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/**
 * What a caller WITHOUT comms.subjects.read is allowed to be told about a
 * participant subject.
 *
 * RLS hides the row outright, which is correct as a boundary but leaves such a
 * caller staring at a story that is blocked from use with nothing explaining
 * why. So the API substitutes this: enough to render the consent chip and the
 * blocked reason, and not one character of identity. No `subject_id`, no real
 * `display_label` — a label like "Marcus" IS the identifying data the split
 * permission exists to withhold.
 */
export function redactedSubjectLabel(isMinor: boolean): string {
  return isMinor ? "a young person" : "a participant";
}

export type StorySubjectView = {
  id: string;
  subject_type: SubjectType;
  /** Null whenever the caller lacks comms.subjects.read. */
  subject_id: string | null;
  display_label: string;
  is_minor: boolean;
  consent_state: ConsentState;
  /** True when the label and id were withheld from this caller. */
  redacted: boolean;
  /** Consent rows, omitted entirely for a redacted subject. */
  consents?: ConsentRow[];
};

export type RawSubject = {
  id: string;
  subject_type: string;
  subject_id: string | null;
  display_label: string;
  is_minor: boolean;
  consents?: ConsentRow[] | null;
};

/**
 * Shape one subject row for the caller. `canSeeSubjects` is the
 * comms.subjects.read answer; a non-participant subject is never redacted
 * (a partner school or a donor is not the thing this permission protects).
 */
export function viewSubject(
  row: RawSubject,
  canSeeSubjects: boolean,
  today: string = todayISO(),
): StorySubjectView {
  const consents = row.consents ?? [];
  const state = subjectConsentState(consents, today);
  const redact = !canSeeSubjects && row.subject_type === "participant";
  if (redact) {
    return {
      id: row.id,
      subject_type: "participant",
      subject_id: null,
      display_label: redactedSubjectLabel(row.is_minor),
      is_minor: row.is_minor,
      consent_state: state,
      redacted: true,
    };
  }
  return {
    id: row.id,
    subject_type: row.subject_type as SubjectType,
    subject_id: row.subject_id,
    display_label: row.display_label,
    is_minor: row.is_minor,
    consent_state: state,
    redacted: false,
    consents,
  };
}
