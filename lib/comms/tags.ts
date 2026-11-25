/**
 * Tags on people (constituents.tags, a text array). PURE helpers: one place
 * that decides what a tag name is, so "Board", "board " and "BOARD" can't
 * drift into three tags, and one place that works out which records change
 * when tags are added, removed, renamed or merged.
 *
 * Tags are what a person IS to the org that BloomOS can't work out for
 * itself (Board, Volunteer 2026, Gala table host). What BloomOS can work out
 * from gifts (Donor, Lapsed, Recurring, Never gave) is never stored as a tag:
 * a stored "Donor" goes stale the day someone gives. Those are AUTO_TAGS,
 * counted live and offered as list starting points.
 */

export const TAG_MAX = 40;
/** Most tags one request may add or remove. */
export const TAGS_PER_CHANGE = 20;

/** A clean tag name, or null when nothing usable is left. Commas are
 *  dropped because the record screen edits tags as a comma list. */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/[,\n\r\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, TAG_MAX).trim();
  return t || null;
}

const key = (t: string) => t.toLowerCase();

/** Clean, de-duplicated (case-insensitive, first spelling wins) tag list. */
export function normalizeTags(raw: unknown, max = TAGS_PER_CHANGE): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<string, string>();
  for (const r of raw) {
    const t = normalizeTag(r);
    if (t && !seen.has(key(t))) seen.set(key(t), t);
    if (seen.size >= max) break;
  }
  return Array.from(seen.values());
}

/** A record's tags after adding and removing. An existing tag keeps its
 *  spelling; adding "board" to someone tagged "Board" changes nothing. */
export function changeTags(existing: readonly string[] | null, add: readonly string[], remove: readonly string[]): string[] {
  const drop = new Set(remove.map(key));
  const out = new Map<string, string>();
  for (const t of existing ?? []) if (t && !drop.has(key(t)) && !out.has(key(t))) out.set(key(t), t);
  for (const t of add) if (!drop.has(key(t)) && !out.has(key(t))) out.set(key(t), t);
  return Array.from(out.values());
}

/** A record's tags after renaming `from` to `to` (null deletes it). Renaming
 *  onto a tag the record already has merges the two. */
export function renameInTags(existing: readonly string[] | null, from: string, to: string | null): string[] {
  const out = new Map<string, string>();
  for (const t of existing ?? []) {
    if (!t) continue;
    const next = key(t) === key(from) ? to : t;
    if (next && !out.has(key(next))) out.set(key(next), next);
  }
  return Array.from(out.values());
}

export const hasTag = (tags: readonly string[] | null, tag: string) => (tags ?? []).some((t) => key(t) === key(tag));

export type TagRow = { id: string; tags: string[] | null };

/**
 * Which records change, grouped by the tags they end up with. Most people
 * share a result (untagged people all become ["Board"]), so a change to
 * thousands of records is a handful of writes, not thousands.
 */
export function planTagWrites(rows: TagRow[], next: (tags: string[]) => string[]): Array<{ tags: string[]; ids: string[] }> {
  const groups = new Map<string, { tags: string[]; ids: string[] }>();
  for (const r of rows) {
    const before = r.tags ?? [];
    const after = next(before);
    if (after.length === before.length && after.every((t, i) => t === before[i])) continue;
    const k = JSON.stringify(after);
    const g = groups.get(k) ?? { tags: after, ids: [] };
    g.ids.push(r.id);
    groups.set(k, g);
  }
  return Array.from(groups.values());
}

/** Every tag in use with how many people carry it, most used first. Spellings
 *  that differ only by case count together under the most common one. */
export function countTags(rows: TagRow[]): Array<{ tag: string; count: number }> {
  const byKey = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const t of r.tags ?? []) {
      if (!t || seen.has(key(t))) continue;
      seen.add(key(t));
      const e = byKey.get(key(t)) ?? { count: 0, spellings: new Map<string, number>() };
      e.count += 1;
      e.spellings.set(t, (e.spellings.get(t) ?? 0) + 1);
      byKey.set(key(t), e);
    }
  }
  return Array.from(byKey.values())
    .map((e) => ({ tag: Array.from(e.spellings.entries()).sort((a, b) => b[1] - a[1])[0][0], count: e.count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Tags another part of BloomOS writes on its own. Renaming or deleting one
 *  here would be undone at the next sync, so the Tags page leaves them be.
 *  AIG: fr_sync_hubspot_to_spine re-adds it on every HubSpot sync. */
export const SYSTEM_TAGS: readonly string[] = ["AIG"];
export const isSystemTag = (tag: string) => SYSTEM_TAGS.some((t) => t.toLowerCase() === tag.trim().toLowerCase());

/** What BloomOS works out from gifts on record. Never stored. `start` is the
 *  list builder's starting point for the same people. */
export const AUTO_TAGS = [
  { key: "donor", label: "Donor", how: "Has at least one gift on record", start: "donors" },
  { key: "lapsed", label: "Lapsed donor", how: "Gave before, nothing yet this year", start: "lapsed" },
  { key: "recurring", label: "Recurring donor", how: "Giving on a schedule now", start: "recurring" },
  { key: "never", label: "Never gave", how: "On your list with no gift yet", start: "never" },
] as const;
