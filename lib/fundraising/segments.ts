import type { createServerSupabase } from "@/lib/supabase/server";
import { constituentName } from "@/lib/fundraising/display";
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

export type Recipient = { id: string; firstName: string; name: string; email: string };

export type ResolvedRecipients = {
  recipients: Recipient[];
  // Segment members excluded from sending, by reason — surfaced in the UI so
  // "N recipients" is honest about who it leaves out.
  excluded: { doNotContact: number; suppressed: number; noEmail: number };
  /** Set when the definition couldn't be applied, or a read failed. The
   *  recipient list is then always empty. */
  error?: string;
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
const KNOWN_KEYS = new Set(["view", "q", "type", "source", "tag", "min_total", "since"]);
const EMAILABLE_VIEWS = new Set<string>(
  BUILT_IN_VIEWS.map((v) => v.value).filter((v) => v !== "prospects" && v !== "mine")
);

export type ParsedSegment = ViewDefinition & { source?: string; tag?: string; since?: string };

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
  return { ok: true, def };
}

type RollupRow = {
  id: string; type: string; first_name: string | null; last_name: string | null;
  org_name: string | null; emails: string[] | null; do_not_contact: boolean;
};

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

  const members = await readAll<RollupRow>(() => {
    let q = supabase
      .from("v_fr_rollups")
      .select("id, type, first_name, last_name, org_name, emails, do_not_contact")
      .eq("org_id", orgId);
    q = applyRollupFilters(q, def, todayISO);
    if (def.tag) q = q.contains("tags", [def.tag]);
    if (def.since) q = q.gte("last_gift", def.since);
    return q.order("id");
  });
  if (members.error) return fail("Couldn't read the segment. Nothing was sent.");

  // RLS scopes the suppression list to the caller's org. citext in the DB;
  // lowercase for the in-memory comparison.
  const sup = await readAll<{ email: string }>(() =>
    supabase.from("email_suppressions").select("email").eq("org_id", orgId).order("email")
  );
  if (sup.error) return fail("Couldn't read the unsubscribe list. Nothing was sent.");
  const suppressed = new Set(sup.rows.map((s) => s.email.toLowerCase()));

  const recipients: Recipient[] = [];
  for (const c of members.rows) {
    // Exclusion counts are relative to the segment, not the whole list.
    if (idSets.some((s) => !s.has(c.id))) continue;
    const email = (c.emails ?? [])[0];
    if (c.do_not_contact) { excluded.doNotContact += 1; continue; }
    if (!email) { excluded.noEmail += 1; continue; }
    if (suppressed.has(email.toLowerCase())) { excluded.suppressed += 1; continue; }
    recipients.push({ id: c.id, firstName: c.first_name ?? "", name: constituentName(c), email });
  }
  return { recipients, excluded };
}
