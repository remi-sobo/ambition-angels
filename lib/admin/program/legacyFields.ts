// Participant spine (spec #4), D2→D5 transitional.
//
// These students columns moved onto the per-org custom-field registry (the AA
// seed in participant_aa_custom_fields.MANUAL.sql). Until D5 drops the columns,
// the student write paths DUAL-WRITE: they store values in custom_fields AND
// mirror the same-named keys back to these columns, so readers not yet migrated
// (cohort rosters, global search, intake-accept) keep seeing current values.
//
// Plain module (no "server-only" / "use client") so both the API routes and the
// client form can import the list. Deleted in D5 with the columns.
export const LEGACY_STUDENT_FIELD_KEYS = [
  "grade",
  "school",
  "dob",
  "guardian_name",
  "guardian_email",
  "guardian_phone",
] as const;
