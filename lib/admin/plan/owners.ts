/**
 * Minimal owner → person resolution (Phase B2). Ownership across the plan is a
 * free-text `owner` string ("Remi", "Remi / Empathy Labs", "Empathy Labs"). The
 * Mine lens and the owner filter need to know which strings belong to a person,
 * so this maps a string to an org member on a confident name match and
 * otherwise keeps it as a free-text label. It deliberately under-includes (a
 * string only resolves to a person when their name appears) rather than
 * wrongly claim one.
 *
 * The person set is the org's members (getOrgAssignees / useAssignees),
 * passed in by the caller — nothing tenant-specific lives here. The richer
 * identity layer (a real people table for tenants) is Phase D.
 */

/** An org member as the plan sees them: id = first-name handle, label = name. */
export type PlanPerson = { id: string; label: string };

export type ResolvedOwner = { id: string | null; label: string };

export function resolveOwner(
  owner: string | null | undefined,
  people: PlanPerson[] = [],
): ResolvedOwner | null {
  const trimmed = owner?.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  for (const p of people) {
    if (p.id && lower.includes(p.id)) return { id: p.id, label: p.label };
  }
  return { id: null, label: trimmed };
}

/** The stable filter value for a resolved owner: the person id, else the label. */
export function ownerValue(r: ResolvedOwner): string {
  return r.id ?? r.label;
}

/** Does this owner string match the given filter value (person id or label)? */
export function matchOwner(
  owner: string | null | undefined,
  value: string,
  people: PlanPerson[] = [],
): boolean {
  const r = resolveOwner(owner, people);
  return r != null && ownerValue(r) === value;
}

/** Sort rank so people lead the owner dropdown, then labels alphabetically. */
export function ownerRank(value: string, people: PlanPerson[] = []): number {
  const i = people.findIndex((p) => p.id === value);
  return i === -1 ? people.length : i;
}
