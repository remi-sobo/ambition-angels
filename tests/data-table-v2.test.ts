import { describe, expect, test } from "vitest";
import {
  applyTableSort,
  filterParams,
  nextSort,
  pageHref,
  pageInfo,
  parseTableState,
  rowRange,
  sortHref,
  tableHref,
  tableSearch,
  type TableSpec,
} from "@/lib/admin/dataTable";
import { DF_TABLE, DF_PROSPECT_TABLE, DF_SORT_COLUMNS } from "@/lib/fundraising/dfTable";

// DataTable v2 (V4 Stage A): the URL is the state. These tests pin the
// round trip (parse → serialize → parse is the identity), the canonical
// URL (defaults omitted, so the Donors & Funders URLs that existed before
// v2 still mean the same thing) and the paging arithmetic.

const BASE = "/admin/fundraising/donors-funders";
const spec: TableSpec = DF_TABLE;

function roundTrip(qs: string, s: TableSpec = spec) {
  const raw = Object.fromEntries(new URLSearchParams(qs).entries());
  const state = parseTableState(raw, s);
  const filters = filterParams(raw);
  const again = Object.fromEntries(new URLSearchParams(tableSearch(filters, state, s)).entries());
  return { state, filters, out: tableSearch(filters, state, s), reparsed: parseTableState(again, s), refilters: filterParams(again) };
}

describe("URL state round trip", () => {
  test.each([
    "",
    "page=2",
    "view=lapsed",
    "view=donors&q=harlow&type=organization&page=3",
    "sort=last_gift",
    "sort=last_gift&dir=asc&page=1",
    "sort=next",
    "sort=next&dir=desc&view=recurring",
    "sort=lifetime&dir=asc&min_total=500",
  ])("%s survives parse → serialize → parse", (qs) => {
    const r = roundTrip(qs);
    expect(r.reparsed).toEqual(r.state);
    expect(r.refilters).toEqual(r.filters);
  });

  test("the default state is the bare path", () => {
    expect(tableHref(BASE, {}, parseTableState({}, spec), spec)).toBe(BASE);
    // An explicit default sort collapses to the canonical URL.
    expect(roundTrip("sort=lifetime&dir=desc").out).toBe("");
    expect(roundTrip("sort=lifetime").out).toBe("");
  });

  test("pre-v2 Donors & Funders URLs keep their meaning", () => {
    // page is 0-based and omitted on the first page, exactly as before.
    expect(roundTrip("view=lapsed&page=1").out).toBe("view=lapsed&page=1");
    expect(roundTrip("page=0").out).toBe("");
    const s = parseTableState({ view: "donors", q: "ash" }, spec);
    expect(s).toEqual({ page: 0, sort: { key: "lifetime", dir: "desc" } });
  });

  test("bad input degrades, never throws", () => {
    expect(parseTableState({ page: "-3" }, spec).page).toBe(0);
    expect(parseTableState({ page: "abc" }, spec).page).toBe(0);
    expect(parseTableState({ page: "1e9" }, spec).page).toBe(0);
    expect(parseTableState({ sort: "name" }, spec).sort).toEqual(spec.defaultSort);
    expect(parseTableState({ sort: "last_gift", dir: "sideways" }, spec).sort).toEqual({ key: "last_gift", dir: "desc" });
    expect(parseTableState({ page: ["2", "5"] }, spec).page).toBe(2);
  });

  test("filterParams drops the table's own params and empty values", () => {
    expect(filterParams({ view: "donors", q: "", page: "2", sort: "gifts", dir: "asc", drawer: "research" }, ["drawer"])).toEqual({
      view: "donors",
    });
  });
});

describe("sort links", () => {
  const state = parseTableState({}, spec);

  test("a new column sorts in its first direction and resets the page", () => {
    const paged = parseTableState({ page: "4" }, spec);
    expect(sortHref(BASE, { view: "donors" }, paged, "last_gift", spec)).toBe(`${BASE}?view=donors&sort=last_gift`);
    expect(sortHref(BASE, {}, state, "next", spec)).toBe(`${BASE}?sort=next`);
  });

  test("the active column flips, and flipping back to the default is the bare path", () => {
    expect(nextSort(state, "lifetime", spec)).toEqual({ key: "lifetime", dir: "asc" });
    expect(sortHref(BASE, {}, state, "lifetime", spec)).toBe(`${BASE}?sort=lifetime&dir=asc`);
    const asc = parseTableState({ sort: "lifetime", dir: "asc" }, spec);
    expect(sortHref(BASE, {}, asc, "lifetime", spec)).toBe(BASE);
  });

  test("applyTableSort maps keys to columns, nulls last, id tiebreak", () => {
    const calls: unknown[] = [];
    const q = { order(c: string, o?: object) { calls.push([c, o ?? null]); return q; } };
    applyTableSort(q, { key: "last_gift", dir: "asc" }, DF_SORT_COLUMNS);
    expect(calls).toEqual([["last_gift", { ascending: true, nullsFirst: false }], ["id", null]]);
    calls.length = 0;
    applyTableSort(q, { key: "nope", dir: "asc" }, DF_SORT_COLUMNS);
    expect(calls).toEqual([["id", null]]);
  });

  test("every sortable Donors & Funders key has a database column", () => {
    for (const c of DF_TABLE.sortable) expect(DF_SORT_COLUMNS[c.key], c.key).toBeTruthy();
    expect(DF_PROSPECT_TABLE.sortable).toEqual([]);
  });
});

describe("paging", () => {
  test("rowRange is the PostgREST range for a 0-based page", () => {
    expect(rowRange(0, 50)).toEqual({ from: 0, to: 49 });
    expect(rowRange(2, 50)).toEqual({ from: 100, to: 149 });
  });

  test("pageInfo: first, middle, last and single pages", () => {
    expect(pageInfo(0, 50, 150, 50)).toMatchObject({ pageCount: 3, from: 1, to: 50, hasPrev: false, hasNext: true });
    expect(pageInfo(1, 50, 150, 50)).toMatchObject({ from: 51, to: 100, hasPrev: true, hasNext: true });
    expect(pageInfo(2, 50, 120, 20)).toMatchObject({ pageCount: 3, from: 101, to: 120, hasNext: false });
    expect(pageInfo(0, 50, 7, 7)).toMatchObject({ pageCount: 1, hasPrev: false, hasNext: false });
    expect(pageInfo(0, 50, 0, 0)).toMatchObject({ pageCount: 1, from: 0, to: 0, pastEnd: false });
  });

  test("a stale link past the end is flagged", () => {
    expect(pageInfo(9, 50, 120, 0).pastEnd).toBe(true);
  });

  test("page links carry filters and sort", () => {
    const st = parseTableState({ sort: "gifts", page: "1" }, spec);
    expect(pageHref(BASE, { view: "donors" }, st, 2, spec)).toBe(`${BASE}?view=donors&sort=gifts&page=2`);
    expect(pageHref(BASE, { view: "donors" }, st, 0, spec)).toBe(`${BASE}?view=donors&sort=gifts`);
  });
});
