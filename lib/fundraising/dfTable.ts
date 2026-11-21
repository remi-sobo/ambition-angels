import type { TableSpec } from "@/lib/admin/dataTable";

// PURE (no server imports) so tests/data-table-v2.test.ts can read it.
// lib/admin/donorsFunders.ts re-exports these and pages with them.

export const DF_PAGE_SIZE = 50;

/**
 * DataTable v2 contract for the constituents list (V4 Stage A): the URL
 * sort keys, the order with no sort param (the F1 order: biggest lifetime
 * giving first), and the database column each key orders by. Name is not
 * sortable: it is a display join of three columns.
 */
export const DF_TABLE: TableSpec = {
  sortable: [
    { key: "lifetime", first: "desc" },
    { key: "gifts", first: "desc" },
    { key: "last_gift", first: "desc" },
    { key: "last_touch", first: "desc" },
    { key: "next", first: "asc" },
  ],
  defaultSort: { key: "lifetime", dir: "desc" },
  pageSize: DF_PAGE_SIZE,
};

export const DF_SORT_COLUMNS: Record<string, string> = {
  lifetime: "lifetime_total",
  gifts: "gift_count",
  last_gift: "last_gift",
  last_touch: "last_touch",
  next: "next_step_due",
};

/** The Prospects view has no sortable columns: newest first, always. */
export const DF_PROSPECT_TABLE: TableSpec = { sortable: [], defaultSort: null, pageSize: DF_PAGE_SIZE };
