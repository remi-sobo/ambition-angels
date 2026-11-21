import { tableHref, type TableSpec } from "@/lib/admin/dataTable";

/**
 * Finance → Transactions on DataTable v2 (V4 Stage G2). PURE: the URL
 * vocabulary, the table spec and the next-step rule, shared by the page and
 * the filter row, and unit-tested.
 *
 * URL (unchanged from V1, so old links keep working): q, category
 * ("uncategorized" or a category id), from, to (ISO dates), status
 * (inflow | outflow | restricted). Table params: page (0-based), sort, dir.
 */

export const TX_BASE = "/admin/finance/transactions";

export const TX_TABLE: TableSpec = {
  sortable: [
    { key: "date", first: "desc" },
    { key: "amount", first: "desc" },
  ],
  defaultSort: { key: "date", dir: "desc" },
  pageSize: 50,
};

/** URL sort key → database column. */
export const TX_SORT_COLUMNS: Record<string, string> = { date: "txn_date", amount: "amount" };

export type TxStatus = "" | "inflow" | "outflow" | "restricted";

export type TxFilters = {
  q: string;
  category: string;
  from: string;
  to: string;
  status: TxStatus;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseTxFilters(raw: Raw): TxFilters {
  const status = one(raw.status).trim();
  const from = one(raw.from).trim();
  const to = one(raw.to).trim();
  return {
    q: one(raw.q).trim().slice(0, 200),
    category: one(raw.category).trim().slice(0, 100),
    from: ISO.test(from) ? from : "",
    to: ISO.test(to) ? to : "",
    status: status === "inflow" || status === "outflow" || status === "restricted" ? status : "",
  };
}

/** The filter params to carry through sort and page links (empties dropped). */
export function txFilterParams(f: TxFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (v) out[k] = v;
  return out;
}

/** A filter change: the new filters, first page, default sort. */
export function txFilterHref(f: TxFilters): string {
  return tableHref(TX_BASE, txFilterParams(f), { page: 0, sort: TX_TABLE.defaultSort }, TX_TABLE);
}

/** How many filters are on (search counts). */
export function activeFilterCount(f: TxFilters): number {
  return Object.values(f).filter(Boolean).length;
}

/** Commas, parens, asterisks and percent signs mean something to PostgREST's
 *  or()/ilike syntax; strip them from a search string. */
export function sanitizeTxSearch(s: string): string {
  return s.replace(/[,()*%]/g, "").trim();
}

/** The next-step column: what this row still needs. */
export function txNextStep(row: { category_id: string | null; amount: number; restricted: boolean; restricted_to: string | null }): {
  label: string;
  tone: "warning" | "muted";
} {
  if (!row.category_id) return { label: "Needs a category", tone: "warning" };
  if (row.restricted && !row.restricted_to) return { label: "Restricted: add what it is for", tone: "warning" };
  return { label: "Done", tone: "muted" };
}
