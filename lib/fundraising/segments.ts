import type { createServerSupabase } from "@/lib/supabase/server";
import { constituentName } from "@/lib/fundraising/display";
import { fullNameOf, type MergeData } from "@/lib/comms/merge";
import { normalizeTags, hasTag } from "@/lib/comms/tags";
import {
  applyRollupFilters,
  BUILT_IN_VIEWS,
  sanitizeQuery,
  type BuiltInView,
  type ViewDefinition,
} from "@/lib/fundraising/views";

// Resolve a saved-segment definition to email recipients, shared by the
// comms send, the recipient-count preview and the test send.
//
// Membership is the Donors & Funders list: the same v_fr_rollups read with
// the same filters (applyRollupFilters in lib/fundraising/views.ts), so a
// saved "Lapsed" view emails the people the Lapsed list shows. Giving totals
// are aggregated in the database by that view, never paged into JS. The V1
// export keys the list doesn't carry (source, tag, since) narrow further.
// Archived constituents are never members. Then it requires an email and
// excludes do-not-contact constituents and suppressed addresses
// (email_suppressions: unsubscribes, bounces, complaints).
//
// FAIL CLOSED: a definition with a key or value this resolver does not
// understand resolves to nobody, with an error. It never widens.

export type Recipient = {
  id: string;
  firstName: string;
  name: string;
  email: string;
  /** Merge-field and list-preview data, straight from v_fr_rollups. */
  lastName: string;
  /** The name {{full_name}} fills in, or null when the record has none.
   *  Unlike `name`, it never falls back to the email address. */
  fullName: string | null;
  lastGift: string | null;
  lifetimeTotal: number;
  giftCount: number;
  /** True when the person is on the list only because they were added by hand. */
  added?: boolean;
};

export type ResolvedRecipients = {
  recipients: Recipient[];
  // Segment members excluded from sending, by reason — surfaced in the UI so
  // "N recipients" is honest about who it leaves out.
  excluded: { doNotContact: number; suppressed: number; noEmail: number };
  /** Set when the definition couldn't be applied, or a read failed. The
   *  recipient list is then always empty. */
  error?: string;
  /** People the list's rules matched who were taken off by hand. */
  handRemoved?: number;
  /** Everyone on the list, including people who can't be emailed (no
   *  address, do not contact, unsubscribed). What "tag this list" tags. */
  memberIds?: string[];
};

type SupabaseLike = ReturnType<typeof createServerSupabase>;

/** PostgREST caps a response at max-rows (1,000 on Supabase), so every read
 *  pages with a stable order until a short page comes back. */
const PAGE = 1000;

type Paged = { range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };

async function readAll<T>(query: () => Paged): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) return { rows: [], error: error.message };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return { rows, error: null };
  }
}

/** The Promoted view's id set: constituents a promoted fr_prospects row
 *  points at. Same predicate as lib/admin/donorsFunders.ts, which keeps its
 *  own copy (capped at 1,000 for a page; here it pages in full). */
function promotedIdsQuery(supabase: SupabaseLike, orgId: string) {
  return supabase
    .from("fr_prospects")
    .select("constituent_id")
    .eq("org_id", orgId)
    .eq("status", "promoted")
    .not("constituent_id", "is", null);
}

/** The Volunteers view's id set (constituents.is_volunteer). Same predicate
 *  as lib/admin/donorsFunders.ts. */
function volunteerIdsQuery(supabase: SupabaseLike, orgId: string) {
  return supabase.from("constituents").select("id").eq("org_id", orgId).eq("is_volunteer", true);
}

/** Everything a saved definition may carry (app/api/admin/segments FILTER_KEYS). */
const KNOWN_KEYS = new Set([
  "view", "q", "type", "source", "tag", "min_total", "since",
  // Comms lists (specs/comms-v3-composer.md): two more giving rules, and
  // people added or taken off by hand.
  "before", "never_gave", "include_ids", "exclude_ids", "picked_only",
  // Any of these tags (the list builder's tag picker). "tag" above is the
  // older single, exact tag and still works.
  "tags",
]);
/** Most people one list may carry by hand, each way. */
export const MAX_HAND_PICKED = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 100 ids keeps the request URL well under PostgREST's 8,000 character limit.
export const ID_CHUNK = 100;
const EMAILABLE_VIEWS = new Set<string>(
  BUILT_IN_VIEWS.map((v) => v.value).filter((v) => v !== "prospects" && v !== "mine")
);

export type ParsedSegment = ViewDefinition & {
  source?: string;
  tag?: string;
  since?: string;
  /** Last gift before this date (YYYY-MM-DD). */
  before?: string;
  /** Only people with no gift on record. */
  never_gave?: boolean;
  /** Constituents on the list whatever the rules say. */
  include_ids?: string[];
  /** Constituents taken off the list whatever the rules say. */
  exclude_ids?: string[];
  /** A hand-picked list: only include_ids, no rules. */
  picked_only?: boolean;
  /** Carries at least one of these tags (case-insensitive). */
  tags?: string[];
};

/** A definition's hand-picked ids, validated. Anything that is not a list of
 *  constituent ids is an error, never a silently shorter list. */
function parseIdList(key: string, value: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: `This list's "${key}" is not readable.` };
  if (value.length > MAX_HAND_PICKED) return { ok: false, error: `A list can carry up to ${MAX_HAND_PICKED.toLocaleString("en-US")} hand-picked people.` };
  const ids: string[] = [];
  for (const v of value) {
    if (typeof v !== "string" || !UUID.test(v)) return { ok: false, error: `This list's "${key}" is not readable.` };
    ids.push(v.toLowerCase());
  }
  return { ok: true, ids: Array.from(new Set(ids)) };
}

/** Strictly validate a stored definition. Unlike toDefinition() (the list's
 *  URL parser, which drops what it doesn't know and shows a broader list),
 *  anything unknown here is an error: an email must never widen. */
export function parseSegmentDefinition(
  raw: unknown
): { ok: true; def: ParsedSegment } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, def: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "This segment's definition is not readable." };
  const def: ParsedSegment = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KNOWN_KEYS.has(key)) return { ok: false, error: `This segment uses a filter Comms can't apply ("${key}"). Nothing was sent. Re-save the view in Donors & Funders.` };
    if (value === null || value === undefined || value === "") continue;
    if (key === "include_ids" || key === "exclude_ids") {
      const list = parseIdList(key, value);
      if (!list.ok) return list;
      if (list.ids.length) def[key] = list.ids;
      continue;
    }
    if (key === "tags") {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) return { ok: false, error: `This list's tags are not readable.` };
      const tags = normalizeTags(value);
      // Every tag must survive cleaning: a tag that vanished would widen the list.
      if (tags.length !== new Set((value as string[]).map((v) => v.trim().toLowerCase()).filter(Boolean)).size) {
        return { ok: false, error: `This list's tags are not readable.` };
      }
      if (tags.length) def.tags = tags;
      continue;
    }
    if (key === "picked_only" || key === "never_gave") {
      if (value === true || value === "1" || value === "true") def[key] = true;
      else if (value !== false && value !== "0" && value !== "false") return { ok: false, error: `This list's "${key}" setting is not readable.` };
      continue;
    }
    if (typeof value !== "string") return { ok: false, error: `This segment's "${key}" filter is not readable.` };
    const v = value.trim();
    if (!v) continue;
    switch (key) {
      case "view":
        if (v === "prospects") return { ok: false, error: "The Prospects view can't be emailed: prospects are not constituents yet." };
        if (v === "mine") return { ok: false, error: "My donors depends on who is looking, so it can't be emailed. Save the view from All with the filters you want." };
        if (!EMAILABLE_VIEWS.has(v)) return { ok: false, error: `This segment uses a view Comms doesn't know ("${v}").` };
        if (v !== "all") def.view = v as BuiltInView;
        break;
      case "type":
        if (v !== "person" && v !== "organization") return { ok: false, error: `This segment's type filter is not readable ("${v}").` };
        def.type = v;
        break;
      case "min_total":
        if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) return { ok: false, error: `This segment's minimum total is not a number ("${v}").` };
        if (Number(v) > 0) def.min_total = v;
        break;
      case "since":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: `This segment's "gave since" date is not readable ("${v}").` };
        def.since = v;
        break;
      case "before":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: `This list's "last gift before" date is not readable ("${v}").` };
        def.before = v;
        break;
      case "q": {
        const q = sanitizeQuery(v);
        if (q) def.q = q;
        break;
      }
      case "source":
        def.source = v;
        break;
      case "tag":
        def.tag = v;
        break;
    }
  }
  if (def.picked_only && !def.include_ids?.length) {
    return { ok: false, error: "This hand-picked list has no one on it yet." };
  }
  return { ok: true, def };
}

/** Clean a definition for saving: the known string filters trimmed, the
 *  hand-picked ids validated. Unknown keys are dropped here (a saved view
 *  from Donors & Funders has always been stored this way); the resolver is
 *  what refuses anything it cannot apply. */
export function storableDefinition(
  raw: unknown
): { ok: true; definition: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: true, definition: out };
  const src = raw as Record<string, unknown>;
  for (const k of ["q", "type", "source", "tag", "min_total", "since", "view", "before"]) {
    const v = src[k];
    if (typeof v === "string" && v.trim() !== "") out[k] = v.trim().slice(0, 200);
  }
  for (const k of ["include_ids", "exclude_ids"] as const) {
    if (src[k] === undefined || src[k] === null) continue;
    const list = parseIdList(k, src[k]);
    if (!list.ok) return list;
    if (list.ids.length) out[k] = list.ids;
  }
  for (const k of ["picked_only", "never_gave"]) {
    if (src[k] === true || src[k] === "1" || src[k] === "true") out[k] = "1";
  }
  if (Array.isArray(src.tags)) {
    const tags = normalizeTags(src.tags);
    if (tags.length) out.tags = tags;
  }
  return { ok: true, definition: out };
}

type RollupRow = {
  id: string; type: string; first_name: string | null; last_name: string | null;
  org_name: string | null; emails: string[] | null; do_not_contact: boolean;
  lifetime_total: number | null; gift_count: number | null; last_gift: string | null;
  tags: string[] | null;
};
const ROLLUP_COLUMNS =
  "id, type, first_name, last_name, org_name, emails, do_not_contact, lifetime_total, gift_count, last_gift, tags";

function serverTodayISO(): string {
  // Server-local YYYY-MM-DD, the same clock the Donors & Funders page uses
  // (app/admin/ops/_types/ops.ts todayISO) for the Lapsed cutoff.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function resolveRecipients(
  supabase: SupabaseLike,
  rawDef: unknown,
  /** Pin every read to one org. RLS alone returns rows from every org the
   *  user belongs to, so a member of two orgs would otherwise email the other
   *  org's constituents under this org's identity. */
  orgId: string,
  todayISO: string = serverTodayISO()
): Promise<ResolvedRecipients> {
  const excluded = { doNotContact: 0, suppressed: 0, noEmail: 0 };
  const fail = (error: string): ResolvedRecipients => ({
    recipients: [],
    excluded: { doNotContact: 0, suppressed: 0, noEmail: 0 },
    error,
  });

  const parsed = parseSegmentDefinition(rawDef);
  if (!parsed.ok) return fail(parsed.error);
  const def = parsed.def;

  // Id-set narrowing (views and V1 keys v_fr_rollups doesn't carry),
  // intersected in memory so a large set never lands in a URL.
  const idSets: Set<string>[] = [];
  if (def.view === "promoted") {
    const r = await readAll<{ constituent_id: string }>(() => promotedIdsQuery(supabase, orgId).order("constituent_id"));
    if (r.error) return fail("Couldn't read the segment. Nothing was sent.");
    idSets.push(new Set(r.rows.map((x) => x.constituent_id)));
  }
  if (def.view === "volunteers") {
    const r = await readAll<{ id: string }>(() => volunteerIdsQuery(supabase, orgId).order("id"));
    if (r.error) return fail("Couldn't read the segment. Nothing was sent.");
    idSets.push(new Set(r.rows.map((x) => x.id)));
  }
  if (def.source) {
    const r = await readAll<{ id: string }>(() =>
      supabase.from("constituents").select("id").eq("org_id", orgId).eq("source", def.source).order("id")
    );
    if (r.error) return fail("Couldn't read the segment. Nothing was sent.");
    idSets.push(new Set(r.rows.map((x) => x.id)));
  }

  // Rule members. A hand-picked list has none.
  let ruleRows: RollupRow[] = [];
  if (!def.picked_only) {
    const members = await readAll<RollupRow>(() => {
      let q = supabase.from("v_fr_rollups").select(ROLLUP_COLUMNS).eq("org_id", orgId);
      q = applyRollupFilters(q, def, todayISO);
      if (def.tag) q = q.contains("tags", [def.tag]);
      if (def.since) q = q.gte("last_gift", def.since);
      if (def.before) q = q.lt("last_gift", def.before);
      if (def.never_gave) q = q.eq("gift_count", 0);
      return q.order("id");
    });
    if (members.error) return fail("Couldn't read the segment. Nothing was sent.");
    ruleRows = members.rows.filter((c) => !idSets.some((s) => !s.has(c.id)));
    // Any-of tags, matched here so "Board" and "board" are the same tag.
    if (def.tags?.length) ruleRows = ruleRows.filter((c) => def.tags!.some((t) => hasTag(c.tags, t)));
  }

  // People added by hand: on the list whatever the rules say, but still
  // pinned to this org, never archived, and still subject to every
  // exclusion below.
  const byId = new Map<string, RollupRow>(ruleRows.map((c) => [c.id, c]));
  const addedIds = new Set<string>();
  const include = def.include_ids ?? [];
  for (let i = 0; i < include.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from("v_fr_rollups")
      .select(ROLLUP_COLUMNS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .in("id", include.slice(i, i + ID_CHUNK));
    if (error) return fail("Couldn't read the list. Nothing was sent.");
    for (const c of (data ?? []) as RollupRow[]) {
      if (!byId.has(c.id)) {
        byId.set(c.id, c);
        addedIds.add(c.id);
      }
    }
  }
  const removed = new Set(def.exclude_ids ?? []);
  let handRemoved = 0;

  // RLS scopes the suppression list to the caller's org. citext in the DB;
  // lowercase for the in-memory comparison.
  const sup = await readAll<{ email: string }>(() =>
    supabase.from("email_suppressions").select("email").eq("org_id", orgId).order("email")
  );
  if (sup.error) return fail("Couldn't read the unsubscribe list. Nothing was sent.");
  const suppressed = new Set(sup.rows.map((s) => s.email.toLowerCase()));

  const recipients: Recipient[] = [];
  const memberIds: string[] = [];
  for (const c of Array.from(byId.values())) {
    // Exclusion counts are relative to the segment, not the whole list.
    if (removed.has(c.id)) { handRemoved += 1; continue; }
    memberIds.push(c.id);
    const email = (c.emails ?? [])[0];
    if (c.do_not_contact) { excluded.doNotContact += 1; continue; }
    if (!email) { excluded.noEmail += 1; continue; }
    if (suppressed.has(email.toLowerCase())) { excluded.suppressed += 1; continue; }
    recipients.push({
      id: c.id,
      firstName: c.first_name ?? "",
      name: constituentName(c),
      email,
      lastName: c.last_name ?? "",
      fullName: fullNameOf(c),
      lastGift: c.last_gift ?? null,
      lifetimeTotal: Number(c.lifetime_total ?? 0),
      giftCount: Number(c.gift_count ?? 0),
      ...(addedIds.has(c.id) ? { added: true } : {}),
    });
  }
  return { recipients, excluded, handRemoved, memberIds };
}

/** A recipient as merge-field data (lib/comms/merge.ts). */
export function recipientMergeData(r: Recipient): MergeData {
  return {
    first_name: r.firstName || null,
    last_name: r.lastName || null,
    full_name: r.fullName,
    last_gift: r.lastGift,
    lifetime_total: r.lifetimeTotal,
    gift_count: r.giftCount,
  };
}

/** The composer's "show me" filters, shared by the preview and the test send
 *  so a test is written as the person on screen. Sorted by name first. */
export type RecipientFilter = "all" | "no_first_name" | "never_gave";
export function previewPool(recipients: Recipient[], only: RecipientFilter): Recipient[] {
  const sorted = [...recipients].sort((a, b) => a.name.localeCompare(b.name));
  if (only === "no_first_name") return sorted.filter((r) => !r.firstName.trim());
  if (only === "never_gave") return sorted.filter((r) => r.giftCount === 0);
  return sorted;
}
