// The student row shape and its pure field helpers — SERVER-SAFE, no
// directive. Extracted from _components/StudentControls.tsx ("use client")
// after a production crash: a server component importing `cf` from a client
// module gets a client reference, not a callable, and
// /admin/programs/overview threw `(0, c.cf) is not a function` at render
// (Vercel digest 573398458). Pure data helpers live here; StudentControls
// re-exports them so client importers are untouched.

export type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  stage: string;
  notes: string | null;
  last_activity_at: string | null;
  external_source: string | null;
  // Participant fields (grade / school / guardian_* / dob) live here now — the
  // AA-specific columns were dropped in D5. The registry (custom_field_defs)
  // defines which keys an org shows.
  custom_fields: Record<string, unknown> | null;
  // Assigned leader: a volunteer-flagged constituent of the same org.
  leader_id: string | null;
};

export function fullName(s: Pick<Student, "first_name" | "last_name">) {
  return [s.first_name, s.last_name].filter(Boolean).join(" ");
}

// Registry value read (spec #4): participant fields live in custom_fields,
// keyed by the def's `key`. Returns "" for an unset field.
export function cf(s: Student, key: string): string {
  const v = (s.custom_fields ?? {})[key];
  return v === null || v === undefined ? "" : String(v);
}
