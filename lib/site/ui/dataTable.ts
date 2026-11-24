/**
 * DataTable v2: the URL state and loader contract (V4 Stage A,
 * specs/bloomos-v4-product-readiness.md §6 "DataTable v2: rebuilt on the
 * Donors & Funders pattern: filters in the URL, saved views on the server,
 * server-side paging and sort").
 *
 * PURE: no React, no server imports. The page parses its searchParams with
 * parseTableState, hands a TableQuery to its loader, and gives the result to
 * <DataTable> (app/admin/_components/ui/DataTable.tsx), which builds every
 * sort and page link with the helpers below. Nothing lives in client state or
 * localStorage, so a URL always reproduces the screen it was copied from.
 *
 * URL vocabulary (kept compatible with the Donors & Funders URLs that
 * existed before v2):
 *   page=N       0-based page index, omitted on the first page
 *   sort=<key>   a column key from the spec's sort list, omitted at the default
 *   dir=asc|desc omitted when it is the column's first direction
 *   anything else is a filter the page owns (view, q, type, ...), carried
 *   through untouched on every sort and page link.
 */

export type SortDir = "asc" | "desc";
export type TableSort = { key: string; dir: SortDir };

/** One sortable column: its URL key and the direction a first click sorts in
 *  (money and dates read best newest or largest first). */
export type SortableColumn = { key: string; first?: SortDir };

export type TableSpec = {
  /** Columns the server knows how to order by. Anything else in the URL is
   *  ignored, so a stale or hand-edited link degrades to the default order. */
  sortable: readonly SortableColumn[];
  /** The order the loader applies with no sort param. Shown as the active
   *  sort on its column. null = the loader's own order, no column marked. */
  defaultSort: TableSort | null;
  pageSize: number;
};

export type TableState = {
  page: number;
  /** The effective sort: the URL's, or the spec default. */
  sort: TableSort | null;
};

/** The contract between a list page and its loader. `filters` is the page's
 *  own validated filter definition (Donors & Funders: ViewDefinition). */
export type TableQuery<F> = {
  filters: F;
  page: number;
  pageSize: number;
  sort: TableSort | null;
};

/** What a loader returns: one page of rows and the total for the filters. */
export type TablePage<Row> = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  /** A failed read. The table shows a danger Notice and keeps the frame. */
  error?: string | null;
};

export type TableLoader<Row, F> = (query: TableQuery<F>) => Promise<TablePage<Row>>;

type RawParams = Record<string, string | string[] | undefined>;

/** The params the table itself owns. Everything else is a filter. */
export const TABLE_PARAMS = ["page", "sort", "dir"] as const;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function firstDir(spec: TableSpec, key: string): SortDir {
  return spec.sortable.find((c) => c.key === key)?.first ?? "asc";
}

/** searchParams → a validated table state. Never throws: unknown keys,
 *  negative or non-numeric pages and bad directions all fall back. */
export function parseTableState(raw: RawParams, spec: TableSpec): TableState {
  const pageRaw = first(raw.page);
  const n = pageRaw && /^\d{1,6}$/.test(pageRaw.trim()) ? Number(pageRaw.trim()) : 0;
  const page = Number.isFinite(n) && n > 0 ? n : 0;

  const key = first(raw.sort);
  const col = key ? spec.sortable.find((c) => c.key === key) : undefined;
  if (!col) return { page, sort: spec.defaultSort };
  const d = first(raw.dir);
  const dir: SortDir = d === "asc" || d === "desc" ? d : firstDir(spec, col.key);
  return { page, sort: { key: col.key, dir } };
}

/** The filter params of a request: every param the table does not own, with
 *  empty values dropped. Use it to carry filters through table links. */
export function filterParams(raw: RawParams, drop: readonly string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if ((TABLE_PARAMS as readonly string[]).includes(k) || drop.includes(k)) continue;
    const s = first(v);
    if (s !== undefined && s !== "") out[k] = s;
  }
  return out;
}

function sameSort(a: TableSort | null, b: TableSort | null): boolean {
  return (a === null && b === null) || (!!a && !!b && a.key === b.key && a.dir === b.dir);
}

/** State + filters → the query string (no leading "?"). Defaults are omitted
 *  so the canonical URL of the first, default-sorted page is the bare path. */
export function tableSearch(filters: Record<string, string>, state: TableState, spec: TableSpec): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if ((TABLE_PARAMS as readonly string[]).includes(k)) continue;
    if (v !== "") params.set(k, v);
  }
  if (state.sort && !sameSort(state.sort, spec.defaultSort)) {
    params.set("sort", state.sort.key);
    if (state.sort.dir !== firstDir(spec, state.sort.key)) params.set("dir", state.sort.dir);
  }
  if (state.page > 0) params.set("page", String(state.page));
  return params.toString();
}

export function tableHref(
  base: string,
  filters: Record<string, string>,
  state: TableState,
  spec: TableSpec,
): string {
  const s = tableSearch(filters, state, spec);
  return s ? `${base}?${s}` : base;
}

/** The sort a click on `key` moves to: a new column sorts in its first
 *  direction; the active column flips. */
export function nextSort(state: TableState, key: string, spec: TableSpec): TableSort {
  if (state.sort?.key === key) return { key, dir: state.sort.dir === "asc" ? "desc" : "asc" };
  return { key, dir: firstDir(spec, key) };
}

/** The link a sortable header carries. Changing the order returns to page 1. */
export function sortHref(
  base: string,
  filters: Record<string, string>,
  state: TableState,
  key: string,
  spec: TableSpec,
): string {
  return tableHref(base, filters, { page: 0, sort: nextSort(state, key, spec) }, spec);
}

export function pageHref(
  base: string,
  filters: Record<string, string>,
  state: TableState,
  page: number,
  spec: TableSpec,
): string {
  return tableHref(base, filters, { ...state, page: Math.max(0, page) }, spec);
}

/** Paging arithmetic for the footer ("Showing 51–100 of 150"). */
export function pageInfo(page: number, pageSize: number, total: number, shown: number) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const from = shown > 0 ? page * pageSize + 1 : 0;
  const to = shown > 0 ? page * pageSize + shown : 0;
  return {
    pageCount,
    from,
    to,
    hasPrev: page > 0,
    hasNext: page + 1 < pageCount,
    /** A page past the end (a stale link after rows were removed). */
    pastEnd: total > 0 && shown === 0 && page > 0,
  };
}

/** The 0-based row range a loader asks PostgREST for (`.range(from, to)`). */
export function rowRange(page: number, pageSize: number): { from: number; to: number } {
  const from = page * pageSize;
  return { from, to: from + pageSize - 1 };
}

/** The PostgREST order method, structurally. */
export interface Orderable<Q> {
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): Q;
}

/**
 * Push a table sort into a PostgREST query. `columns` maps each sortable URL
 * key to its database column; a sort whose key is not mapped is ignored.
 * Nulls always sort last (an empty "last gift" is not the most recent one),
 * and `tiebreak` (usually "id") keeps paging stable under ties.
 */
export function applyTableSort<Q extends Orderable<Q>>(
  query: Q,
  sort: TableSort | null,
  columns: Record<string, string>,
  tiebreak = "id",
): Q {
  let q = query;
  const col = sort ? columns[sort.key] : undefined;
  if (sort && col) q = q.order(col, { ascending: sort.dir === "asc", nullsFirst: false });
  return tiebreak ? q.order(tiebreak) : q;
}

/**
 * A bulk action on the selected rows, as data (it crosses from the server
 * page into the client footer, so it cannot be a function).
 *  - "request": saveAction sends `{ ids: [...] }` to `url`; on success the
 *    selection clears and the page re-reads. No optimistic update.
 *  - "link": navigates to `href` with `?<param>=id1,id2` appended (an export,
 *    a compose screen prefilled with recipients).
 *  - "choose": opens a menu of `options`; picking one sends
 *    `{ ids: [...], <field>: value }` to `url` (an empty value sends null),
 *    e.g. "Assign to…" with the org's members (V4 B2).
 *  - "run": calls `run(ids)` in the browser (copy emails, open a composer).
 *    Only for a table rendered from a client component, since a function
 *    cannot cross from a server page; the selection clears when it settles.
 */
export type DataTableBulkAction =
  | {
      kind: "request";
      key: string;
      label: string;
      url: string;
      method?: "POST" | "PATCH" | "DELETE";
      /** Asks first, with this title; the button label is the confirm verb. */
      confirm?: string;
      confirmBody?: string;
      success?: string;
      tone?: "danger";
    }
  | { kind: "link"; key: string; label: string; href: string; param?: string; tone?: "danger" }
  | {
      kind: "choose";
      key: string;
      label: string;
      url: string;
      method?: "POST" | "PATCH";
      field: string;
      options: { value: string; label: string }[];
      /** Success toast; `{label}` is replaced with the chosen option's label. */
      success?: string;
      tone?: undefined;
    }
  | { kind: "run"; key: string; label: string; run: (ids: string[]) => void | Promise<void>; tone?: "danger" };
