/**
 * Tenant-neutral assignee options (pure — safe to import from client code).
 *
 * ops_tasks.assigned_to / compliance_items.assigned_to store a lowercase
 * first-name handle ("remi", "shannon", …). That convention predates real
 * user references, and the sync_assigned_to_id trigger maps it onto a
 * profile uuid by matching the FIRST TOKEN of profiles.display_name — so the
 * canonical handle for any member is the first token of their display name,
 * lowercased. Deriving options from the org's memberships (instead of a
 * hardcoded Remi/Shannon list) keeps AA's stored values working verbatim
 * while giving every other tenant their own people.
 */

export type AssigneeOption = { value: string; label: string };

export type AssignableMember = {
  displayName: string;
  /** Membership role; board viewers aren't assignable work owners. */
  role?: string | null;
};

/** Canonical stored handle for a person: first display-name token, lowercased.
 *  Characters PostgREST treats as filter syntax are stripped so the handle is
 *  always safe inside `.or("assigned_to.eq.<handle>")` strings. */
export function assigneeSlug(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().replace(/[(),."'\\]/g, "");
}

/** First display-name token with its original casing — the dropdown label. */
export function assigneeLabel(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Member rows → deduped, alphabetized dropdown options. */
export function deriveAssigneeOptions(members: AssignableMember[]): AssigneeOption[] {
  const seen = new Map<string, string>();
  for (const m of members) {
    if (m.role === "board_viewer") continue;
    const value = assigneeSlug(m.displayName);
    if (!value || seen.has(value)) continue;
    seen.set(value, assigneeLabel(m.displayName));
  }
  return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

/** Loose validity check for a handle arriving from the client. The DB no
 *  longer constrains assigned_to to a fixed set, so this only rejects
 *  obviously-broken input, not unknown people. */
export function isValidAssignee(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= 64;
}

/** Map stored text (possibly legacy free text like "Remi Sobo") onto the
 *  first-name handle the dropdowns and filters use. */
export function normalizeAssignee(v: string | null | undefined): string {
  return v ? assigneeSlug(v) : "";
}

/** Display label for a stored handle/free-text assignee: capitalized first token. */
export function handleLabel(v: string): string {
  const first = v.trim().split(/\s+/)[0] ?? v;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
