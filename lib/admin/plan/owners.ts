import type { AdminUser } from "@/lib/admin/auth";

/**
 * Minimal owner → person resolution (Phase B2). Ownership across the plan is a
 * free-text `owner` string ("Remi", "Remi / Empathy Labs", "Empathy Labs"). The
 * Mine lens and the owner filter need to know which strings belong to a person,
 * so this maps a string to an AdminUser on a confident name match and otherwise
 * keeps it as a free-text label. It deliberately under-includes (a string only
 * resolves to a person when their name appears) rather than wrongly claim one.
 *
 * The richer identity layer (initials chips, external-owner styling, a real
 * people table for tenants) is Phase D / a later tenant concern.
 */

const PEOPLE: { id: AdminUser; label: string; aliases: string[] }[] = [
  { id: "remi", label: "Remi", aliases: ["remi"] },
  { id: "shannon", label: "Shannon", aliases: ["shannon"] },
];

export type ResolvedOwner = { id: AdminUser | null; label: string };

export function resolveOwner(owner: string | null | undefined): ResolvedOwner | null {
  const trimmed = owner?.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  for (const p of PEOPLE) {
    if (p.aliases.some((a) => lower.includes(a))) return { id: p.id, label: p.label };
  }
  return { id: null, label: trimmed };
}

/** The stable filter value for a resolved owner: the person id, else the label. */
export function ownerValue(r: ResolvedOwner): string {
  return r.id ?? r.label;
}

/** Does this owner string match the given filter value (person id or label)? */
export function matchOwner(owner: string | null | undefined, value: string): boolean {
  const r = resolveOwner(owner);
  return r != null && ownerValue(r) === value;
}

/** Sort rank so people lead the owner dropdown, then labels alphabetically. */
export function ownerRank(value: string): number {
  const i = PEOPLE.findIndex((p) => p.id === value);
  return i === -1 ? PEOPLE.length : i;
}
