import type { SupabaseClient } from "@supabase/supabase-js";

// Shared "match-or-create a constituent from a free-text name".
//
// Two flavors over one matcher:
//   * resolveConstituent: used by opportunities, Strategy add-funder, prospect
//     promote and gift-table placements. Several matches link the first, with
//     a warning (unchanged behavior for those callers).
//   * resolveConstituentStrict: used by money writes (gifts, pledges,
//     recurring, soft credits). Several matches are NOT guessed: it returns the
//     candidates so the caller can ask. An explicit id must belong to the org.
//
// Both match ONLY inside `orgId` (a user in two orgs must never link the other
// org's donor; RLS alone allows it), and the name is safe for any characters:
// a comma, paren, quote, star or percent can neither break the PostgREST or()
// filter nor widen the match, so "Smith, Jane (Trust)" finds its record
// instead of silently creating a duplicate.

export type ResolveResult =
  | { constituentId: string; warning?: string }
  | { error: string; status: number };

export type ConstituentCandidate = { id: string; label: string };

export type StrictResolveResult =
  | ResolveResult
  | { error: string; status: 409; candidates: ConstituentCandidate[] };

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

type Row = {
  id: string;
  type?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  org_name?: string | null;
};

const MATCH_LIMIT = 10;

// An ilike pattern that matches `s` exactly (case-insensitive). Every
// character that is special to the or() grammar ( , ( ) " ), to PostgREST's
// like (*), or to LIKE itself (% _ \) becomes the single-char wildcard `_`,
// which still matches the original character. The pattern can then be wider
// than the name, so the caller re-checks rows exactly whenever it changed.
const SPECIAL = /[,()"*%_\\]/g;
function exactPattern(s: string): string {
  return s.replace(SPECIAL, "_");
}

const same = (a: string | null | undefined, b: string) =>
  typeof a === "string" && a.trim().toLowerCase() === b.toLowerCase();

function splitName(name: string) {
  const parts = name.split(/\s+/);
  return { first: parts[0] ?? "", rest: parts.slice(1).join(" ") };
}

async function findMatches(supabase: SupabaseClient, orgId: string, name: string): Promise<Row[]> {
  const { first, rest } = splitName(name);
  const nameP = exactPattern(name);
  const firstP = exactPattern(first);
  const restP = exactPattern(rest);
  const { data } = await supabase
    .from("constituents")
    .select("id, type, first_name, last_name, org_name")
    .eq("org_id", orgId)
    .or(
      [
        `org_name.ilike.${nameP}`,
        rest ? `and(first_name.ilike.${firstP},last_name.ilike.${restP})` : `first_name.ilike.${nameP}`,
        rest ? "" : `last_name.ilike.${nameP}`,
      ]
        .filter(Boolean)
        .join(",")
    )
    .limit(MATCH_LIMIT);
  const rows = (data ?? []) as Row[];
  // A pattern without wildcards IS exact case-insensitive equality; when a
  // character had to become `_`, drop rows that only matched the wildcard.
  if (!/[,()"*%_\\]/.test(name)) return rows;
  return rows.filter(
    (r) =>
      same(r.org_name, name) ||
      (rest ? same(r.first_name, first) && same(r.last_name, rest) : same(r.first_name, name) || same(r.last_name, name))
  );
}

async function createPerson(
  supabase: SupabaseClient,
  orgId: string,
  name: string
): Promise<{ constituentId: string; warning: string } | { error: string; status: number }> {
  const { first, rest } = splitName(name);
  const { data: created, error } = await supabase
    .from("constituents")
    .insert({ org_id: orgId, type: "person", first_name: first || name, last_name: rest || null, source: "manual" })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[resolveConstituent] create failed:", error?.message);
    return { error: "Could not create constituent", status: 500 };
  }
  return {
    constituentId: created.id,
    warning: `Created a new constituent for "${name}". Add contact details on the donor page.`,
  };
}

export async function resolveConstituent(
  supabase: SupabaseClient,
  orgId: string,
  input: { constituentId?: unknown; name?: unknown }
): Promise<ResolveResult> {
  if (isUuid(input.constituentId)) return { constituentId: input.constituentId };

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return { error: "constituent_id or constituent_name is required", status: 400 };
  }

  const matches = await findMatches(supabase, orgId, name);
  if (matches.length === 1) return { constituentId: matches[0].id };
  if (matches.length > 1) {
    return {
      constituentId: matches[0].id,
      warning: `Multiple constituents match "${name}". Linked the first; verify on the donor page.`,
    };
  }
  return createPerson(supabase, orgId, name);
}

function label(r: Row): string {
  const person = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  return (r.type === "organization" ? r.org_name : person || r.org_name) || "Unnamed constituent";
}

/**
 * Strict resolve for money writes: an explicit id must be a constituent of
 * `orgId` (404 otherwise); a name links the one match, creates a person when
 * there is none, and returns 409 with the candidates when there are several.
 */
export async function resolveConstituentStrict(
  supabase: SupabaseClient,
  orgId: string,
  input: { constituentId?: unknown; name?: unknown }
): Promise<StrictResolveResult> {
  if (isUuid(input.constituentId)) {
    const { data } = await supabase
      .from("constituents")
      .select("id")
      .eq("org_id", orgId)
      .eq("id", input.constituentId)
      .maybeSingle();
    if (!data) return { error: "That donor isn't in this organization.", status: 404 };
    return { constituentId: input.constituentId };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return { error: "constituent_id or constituent_name is required", status: 400 };
  }

  const matches = await findMatches(supabase, orgId, name);
  if (matches.length === 1) return { constituentId: matches[0].id };
  if (matches.length > 1) {
    return {
      error: `${matches.length >= MATCH_LIMIT ? "Many" : matches.length} donors match "${name.slice(0, 60)}". Open the right donor and add it from their page.`,
      status: 409,
      candidates: matches.map((r) => ({ id: r.id, label: label(r) })),
    };
  }
  return createPerson(supabase, orgId, name);
}
