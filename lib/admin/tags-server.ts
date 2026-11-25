import type { createServerSupabase } from "@/lib/supabase/server";
import { constituentName } from "@/lib/fundraising/display";
import { fiscalYearStart } from "@/lib/fundraising/views";
import { changeTags, countTags, planTagWrites, renameInTags, AUTO_TAGS, type TagRow } from "@/lib/comms/tags";

/**
 * Reading and changing tags on people, on the caller's session client so RLS
 * applies, with every read and write pinned to the active org as well (RLS
 * alone spans every org a person belongs to).
 *
 * There is no tags table: a tag exists while someone carries it. Changes are
 * worked out in memory (lib/comms/tags.ts planTagWrites) and written as one
 * update per distinct resulting tag set, a hundred people at a time.
 */

type Supabase = ReturnType<typeof createServerSupabase>;

const PAGE = 1000;
const ID_CHUNK = 100;

/** Every active person's id and tags in this org. */
export async function readTagRows(supabase: Supabase, orgId: string): Promise<{ rows: TagRow[]; error: string | null }> {
  const rows: TagRow[] = [];
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data, error } = await supabase
      .from("constituents")
      .select("id, tags")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { rows: [], error: error.message };
    const page = (data ?? []) as TagRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return { rows, error: null };
}

export type TagOverview = {
  tags: Array<{ tag: string; count: number }>;
  automatic: Array<{ key: string; label: string; how: string; start: string; count: number }>;
  people: number;
};

function serverTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The tag library: every tag in use with its count, plus the automatic ones. */
export async function loadTagOverview(supabase: Supabase, orgId: string): Promise<TagOverview> {
  const base = () => supabase.from("v_fr_rollups").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null);
  const [{ rows }, donors, lapsed, recurring, never] = await Promise.all([
    readTagRows(supabase, orgId),
    base().gt("gift_count", 0),
    base().gt("gift_count", 0).lt("last_gift", fiscalYearStart(serverTodayISO())),
    base().eq("recurring_active", true),
    base().eq("gift_count", 0),
  ]);
  const counts: Record<string, number> = {
    donor: donors.count ?? 0,
    lapsed: lapsed.count ?? 0,
    recurring: recurring.count ?? 0,
    never: never.count ?? 0,
  };
  return {
    tags: countTags(rows),
    automatic: AUTO_TAGS.map((a) => ({ ...a, count: counts[a.key] ?? 0 })),
    people: rows.length,
  };
}

async function writePlan(
  supabase: Supabase,
  orgId: string,
  plan: Array<{ tags: string[]; ids: string[] }>
): Promise<{ changed: number; error: string | null }> {
  let changed = 0;
  for (const group of plan) {
    for (let i = 0; i < group.ids.length; i += ID_CHUNK) {
      const { data, error } = await supabase
        .from("constituents")
        .update({ tags: group.tags })
        .eq("org_id", orgId)
        .in("id", group.ids.slice(i, i + ID_CHUNK))
        .select("id");
      if (error) return { changed, error: error.message };
      changed += data?.length ?? 0;
    }
  }
  return { changed, error: null };
}

/** Add and remove tags on a set of people. `ids` are trusted only as far as
 *  the org pin: an id from another org simply matches nothing. */
export async function applyTags(
  supabase: Supabase,
  orgId: string,
  ids: string[],
  add: string[],
  remove: string[]
): Promise<{ people: number; changed: number; error: string | null }> {
  const wanted = new Set(ids);
  const all = await readTagRows(supabase, orgId);
  if (all.error) return { people: 0, changed: 0, error: all.error };
  const rows = all.rows.filter((r) => wanted.has(r.id));
  const plan = planTagWrites(rows, (tags) => changeTags(tags, add, remove));
  const w = await writePlan(supabase, orgId, plan);
  return { people: rows.length, changed: w.changed, error: w.error };
}

/** Rename a tag everywhere, merge it into another, or (to = null) delete it. */
export async function renameTag(
  supabase: Supabase,
  orgId: string,
  from: string,
  to: string | null
): Promise<{ changed: number; error: string | null }> {
  const all = await readTagRows(supabase, orgId);
  if (all.error) return { changed: 0, error: all.error };
  const rows = all.rows.filter((r) => (r.tags ?? []).some((t) => t.toLowerCase() === from.toLowerCase()));
  return writePlan(supabase, orgId, planTagWrites(rows, (tags) => renameInTags(tags, from, to)));
}

/**
 * Carry a rename into this org's saved lists, so a list by "Board" keeps
 * reaching the board after Board becomes Trustees. A delete is NOT carried:
 * taking the tag out of a list's rules would widen it to everyone, so a list
 * by a deleted tag keeps the name and reaches nobody by it.
 */
export async function renameTagInLists(supabase: Supabase, orgId: string, from: string, to: string): Promise<{ lists: number; error: string | null }> {
  const { data, error } = await supabase.from("segments").select("id, definition").eq("org_id", orgId).limit(1000);
  if (error) return { lists: 0, error: error.message };
  const same = (t: unknown) => typeof t === "string" && t.trim().toLowerCase() === from.trim().toLowerCase();
  let lists = 0;
  for (const seg of (data ?? []) as Array<{ id: string; definition: Record<string, unknown> | null }>) {
    const def = seg.definition;
    if (!def || typeof def !== "object" || Array.isArray(def)) continue;
    const next: Record<string, unknown> = { ...def };
    let touched = false;
    if (Array.isArray(def.tags) && def.tags.some(same)) {
      next.tags = renameInTags(def.tags.filter((t): t is string => typeof t === "string"), from, to);
      touched = true;
    }
    if (same(def.tag)) {
      next.tag = to;
      touched = true;
    }
    if (!touched) continue;
    const { error: upErr } = await supabase.from("segments").update({ definition: next }).eq("org_id", orgId).eq("id", seg.id);
    if (upErr) return { lists, error: upErr.message };
    lists += 1;
  }
  return { lists, error: null };
}

type PersonRow = { id: string; type: string; first_name: string | null; last_name: string | null; org_name: string | null; emails: string[] | null };
export type FoundPerson = { id: string; name: string; email: string | null };

const personShape = (c: PersonRow): FoundPerson => ({ id: c.id, name: constituentName(c), email: (c.emails ?? [])[0] ?? null });

/** Every address in a blob of pasted text, lowercased and de-duplicated
 *  ("Ana <ana@x.org>", a spreadsheet column, a comma list). */
export function emailsIn(text: string): string[] {
  return Array.from(new Set((text.match(/[^\s@,;<>()"']+@[^\s@,;<>()"']+\.[^\s@,;<>()"']+/g) ?? []).map((e) => e.toLowerCase())));
}

/**
 * Match addresses to people already in this org. Reads the org's people once
 * and matches in memory: addresses live in an array column, and a few
 * thousand rows is cheaper than a query per address. An address that matches
 * nobody is reported back, never created.
 */
export async function matchEmails(
  supabase: Supabase,
  orgId: string,
  emails: string[]
): Promise<{ matched: FoundPerson[]; unmatched: string[]; error: string | null }> {
  const byEmail = new Map<string, PersonRow>();
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data, error } = await supabase
      .from("v_fr_rollups")
      .select("id, type, first_name, last_name, org_name, emails")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { matched: [], unmatched: [], error: error.message };
    const page = (data ?? []) as PersonRow[];
    for (const c of page) for (const e of c.emails ?? []) if (e && !byEmail.has(e.toLowerCase())) byEmail.set(e.toLowerCase(), c);
    if (page.length < PAGE) break;
  }
  const matched = new Map<string, FoundPerson>();
  const unmatched: string[] = [];
  for (const e of emails) {
    const c = byEmail.get(e);
    if (c) matched.set(c.id, personShape(c));
    else unmatched.push(e);
  }
  return { matched: Array.from(matched.values()), unmatched, error: null };
}
