/**
 * Comms lists (specs/comms-v3-composer.md). A list is a saved `segments` row:
 * rules over the Donors & Funders list, plus people added or taken off by
 * hand. PURE helpers for the list screens; the resolver that decides who is
 * actually on a list is lib/fundraising/segments.ts.
 */

export type ListDefinition = {
  view?: string;
  type?: string;
  min_total?: string;
  since?: string;
  before?: string;
  tag?: string;
  source?: string;
  q?: string;
  never_gave?: string;
  picked_only?: string;
  include_ids?: string[];
  exclude_ids?: string[];
  /** Carries any of these tags. */
  tags?: string[];
};

/** Where a list starts. "picked" is a hand-picked list with no rules. */
export const STARTS = [
  { value: "all", label: "Everyone", hint: "Every person and organization with an email" },
  { value: "donors", label: "Donors", hint: "Anyone who has ever given" },
  { value: "lapsed", label: "Lapsed donors", hint: "Gave before, not yet this year" },
  { value: "recurring", label: "Recurring donors", hint: "Giving on a schedule now" },
  { value: "never", label: "Never gave", hint: "On your list with no gift yet" },
  { value: "volunteers", label: "Volunteers", hint: "People marked as volunteers" },
  { value: "picked", label: "Hand-picked", hint: "Only the people you add yourself" },
] as const;

export type StartValue = (typeof STARTS)[number]["value"];

export function startOf(def: ListDefinition): StartValue {
  if (def.picked_only) return "picked";
  if (def.never_gave) return "never";
  const v = def.view ?? "all";
  return (STARTS.some((s) => s.value === v) ? v : "all") as StartValue;
}

/** Apply a starting point, keeping the hand-picked people. */
export function withStart(def: ListDefinition, start: StartValue): ListDefinition {
  const next: ListDefinition = { ...def };
  delete next.view;
  delete next.never_gave;
  delete next.picked_only;
  if (start === "picked") {
    // A hand-picked list has no rules to narrow.
    return tidy({ include_ids: next.include_ids, exclude_ids: next.exclude_ids, picked_only: "1" });
  }
  if (start === "never") next.never_gave = "1";
  else if (start !== "all") next.view = start;
  return next;
}

/** Drop empty values so two equal lists compare equal and save small. */
export function tidy(def: ListDefinition): ListDefinition {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(def)) {
    if (Array.isArray(v)) {
      if (v.length) out[k] = v;
    } else if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out as ListDefinition;
}

const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** One plain sentence saying what a list is, for the lists page. */
export function describeList(raw: unknown): string {
  const def = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as ListDefinition;
  const start = startOf(def);
  const added = Array.isArray(def.include_ids) ? def.include_ids.length : 0;
  const removed = Array.isArray(def.exclude_ids) ? def.exclude_ids.length : 0;
  if (start === "picked") return `${added.toLocaleString("en-US")} hand-picked ${added === 1 ? "person" : "people"}`;

  const parts: string[] = [STARTS.find((s) => s.value === start)?.label ?? "Everyone"];
  if (def.type === "person") parts.push("people only");
  if (def.type === "organization") parts.push("organizations only");
  if (def.min_total) parts.push(`gave $${Number(def.min_total).toLocaleString("en-US")} or more`);
  if (def.since) parts.push(`last gift on or after ${day(def.since)}`);
  if (def.before) parts.push(`last gift before ${day(def.before)}`);
  if (def.tag) parts.push(`tagged "${def.tag}"`);
  if (Array.isArray(def.tags) && def.tags.length) parts.push(`tagged ${def.tags.join(" or ")}`);
  if (def.q) parts.push(`name has "${def.q}"`);
  if (added) parts.push(`plus ${added} added by hand`);
  if (removed) parts.push(`${removed} taken off by hand`);
  return parts.join(" · ");
}
