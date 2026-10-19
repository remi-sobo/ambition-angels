import { describe, expect, test } from "vitest";
import { PAGE_SIZE, fetchAll } from "../lib/supabase/fetchAll";

// A fake PostgREST: serves `total` rows, never more than PAGE_SIZE per call.
function fakeTable(total: number) {
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, total, from + PAGE_SIZE);
    const data = Array.from({ length: Math.max(0, end - from) }, (_, i) => ({ n: from + i }));
    return { data, error: null };
  };
  return { page, calls };
}

describe("fetchAll", () => {
  test("reads past the 1,000-row response cap", async () => {
    const t = fakeTable(2500);
    const { data, error } = await fetchAll(t.page);
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(data[2499]).toEqual({ n: 2499 });
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  test("stops after one short page", async () => {
    const t = fakeTable(12);
    const { data } = await fetchAll(t.page);
    expect(data).toHaveLength(12);
    expect(t.calls).toHaveLength(1);
  });

  test("an exact multiple of the page size costs one empty trailing read", async () => {
    const t = fakeTable(PAGE_SIZE);
    const { data } = await fetchAll(t.page);
    expect(data).toHaveLength(PAGE_SIZE);
    expect(t.calls).toHaveLength(2);
  });

  test("returns what it has and the error when a page fails", async () => {
    let n = 0;
    const { data, error } = await fetchAll(async () => {
      n++;
      return n === 1
        ? { data: Array.from({ length: PAGE_SIZE }, (_, i) => i), error: null }
        : { data: null, error: { message: "boom" } };
    });
    expect(data).toHaveLength(PAGE_SIZE);
    expect(error).toEqual({ message: "boom" });
  });

  test("respects maxPages", async () => {
    const t = fakeTable(10_000);
    const { data } = await fetchAll(t.page, 2);
    expect(data).toHaveLength(2 * PAGE_SIZE);
  });
});
