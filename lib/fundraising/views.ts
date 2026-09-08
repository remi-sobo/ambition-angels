/**
 * Spec Fundraising, stage F1 — the built-in views of Donors & Funders and
 * the saved-view definition vocabulary (R11). PURE: no server imports, so
 * tests/fr-views.test.ts runs it on fixtures.
 *
 * The one-list rule (spec §Architecture): every built-in view except
 * Prospects is a FILTER over the one constituents list, never a second
 * list. Prospects is the deliberate exception — un-promoted `fr_prospects`
 * rows have no constituent identity yet, so they render only there. A
 * promoted prospect has a constituent row and appears in All/Donors like
 * anyone else (DoD 2: one person, one row).
 */

export type BuiltInView = "all" | "donors" | "prospects" | "recurring" | "lapsed";

export const BUILT_IN_VIEWS: readonly { value: BuiltInView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "donors", label: "Donors" },
  { value: "prospects", label: "Prospects" },
  { value: "recurring", label: "Recurring" },
  { value: "lapsed", label: "Lapsed" },
];

/** Lapsed — RESOLVED: computed, never stored (spec decision 3). Gave in a
 *  prior calendar-fiscal year (the year vocabulary the V1 donors page
 *  already uses), nothing in the current one. */
export function isLapsed(
  lastGift: string | null,
  giftCount: number,
  todayISO: string,
): boolean {
  return giftCount > 0 && !!lastGift && lastGift.slice(0, 4) < todayISO.slice(0, 4);
}

/** The shape the view query returns, as far as the predicates care. */
export type RollupRow = {
  type: string;
  gift_count: number;
  last_gift: string | null;
  recurring_active: boolean;
  archived_at: string | null;
  lifetime_total: number;
};

/**
 * The view semantics, as one testable predicate. The page pushes the same
 * conditions into the database query (PostgREST filters) — this function is
 * the documented contract those filters must match, exercised on fixtures.
 * Prospects is not here on purpose: it reads a different table.
 */
export function matchesView(
  row: RollupRow,
  view: Exclude<BuiltInView, "prospects">,
  todayISO: string,
): boolean {
  if (row.archived_at !== null) return false; // archived hidden everywhere
  switch (view) {
    case "all":
      return true;
    case "donors":
      return row.gift_count > 0;
    case "recurring":
      return row.recurring_active;
    case "lapsed":
      return isLapsed(row.last_gift, row.gift_count, todayISO);
  }
}

/** The date the "lapsed" database filter compares last_gift against:
 *  January 1 of the current fiscal (calendar) year. */
export function fiscalYearStart(todayISO: string): string {
  return `${todayISO.slice(0, 4)}-01-01`;
}

// ── Saved views (R11) ──────────────────────────────────────────────────────
// A saved view is a named filter definition in `segments.definition` —
// the same jsonb vocabulary the V1 export panel already stores, extended
// with `view`. Applying one is expanding its definition into URL params;
// there is no hidden state.

export type ViewDefinition = {
  view?: BuiltInView;
  q?: string;
  type?: "person" | "organization";
  min_total?: string; // dollars, stringly like the V1 definition keys
};

const TYPES = ["person", "organization"] as const;
const VIEW_VALUES = BUILT_IN_VIEWS.map((v) => v.value) as readonly string[];

/**
 * PostgREST `or=(…ilike…)` treats commas and parens as syntax; a search
 * string is data. Strip what would break out of the pattern and cap it.
 */
export function sanitizeQuery(q: string): string {
  return q.replace(/[,()%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** URL params (or a stored definition) → a validated definition. Unknown
 *  values fall away rather than erroring — a stale saved view degrades to
 *  a broader list, never a crash. */
export function toDefinition(raw: Record<string, string | undefined>): ViewDefinition {
  const def: ViewDefinition = {};
  if (raw.view && VIEW_VALUES.includes(raw.view)) def.view = raw.view as BuiltInView;
  if (raw.q) {
    const q = sanitizeQuery(raw.q);
    if (q) def.q = q;
  }
  if (raw.type && (TYPES as readonly string[]).includes(raw.type))
    def.type = raw.type as ViewDefinition["type"];
  if (raw.min_total && /^\d{1,9}$/.test(raw.min_total.trim()))
    def.min_total = raw.min_total.trim();
  return def;
}

/** A definition → the query string that applies it (no leading "?"). */
export function definitionToParams(def: ViewDefinition): string {
  const params = new URLSearchParams();
  if (def.view && def.view !== "all") params.set("view", def.view);
  if (def.q) params.set("q", def.q);
  if (def.type) params.set("type", def.type);
  if (def.min_total) params.set("min_total", def.min_total);
  return params.toString();
}
