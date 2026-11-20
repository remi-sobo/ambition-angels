import { describe, expect, test, vi } from "vitest";

// finance.ts sits on the resolver import path and calls React's RSC-only
// `cache` at module scope; identity shim as in metric-resolvers.test.ts.
vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: (mod as { cache?: unknown }).cache ?? (<T,>(fn: T) => fn) };
});
vi.mock("server-only", () => ({}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll, type PageableQuery } from "@/lib/supabase/fetchAll";
import { loadReceivedTotal } from "@/lib/finance/schedule";
import { METRIC_RESOLVERS } from "@/lib/admin/metrics/resolvers";

// A fake PostgREST that behaves like Supabase's: filters, order, range, and a
// hard server-side max_rows of 1,000 that truncates SILENTLY, including a bare
// await with no range (the old loaders' shape).
const MAX_ROWS = 1000;
type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  const calls = { requests: 0 };
  function builder(rows: Row[]) {
    let filtered = rows;
    const orders: Array<{ column: string; ascending: boolean }> = [];
    let window: [number, number] | null = null;
    const run = () => {
      calls.requests++;
      let out = [...filtered];
      if (orders.length) {
        out.sort((a, b) => {
          for (const o of orders) {
            const av = a[o.column] as string | number;
            const bv = b[o.column] as string | number;
            if (av < bv) return o.ascending ? -1 : 1;
            if (av > bv) return o.ascending ? 1 : -1;
          }
          return 0;
        });
      }
      if (window) out = out.slice(window[0], window[1] + 1);
      return { data: out.slice(0, MAX_ROWS), error: null };
    };
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => ((filtered = filtered.filter((r) => r[c] === v)), b),
      in: (c: string, vs: unknown[]) => ((filtered = filtered.filter((r) => vs.includes(r[c]))), b),
      gte: (c: string, v: string) => ((filtered = filtered.filter((r) => String(r[c]) >= v)), b),
      lte: (c: string, v: string) => ((filtered = filtered.filter((r) => String(r[c]) <= v)), b),
      order: (column: string, opts?: { ascending?: boolean }) => (orders.push({ column, ascending: opts?.ascending ?? true }), b),
      range: (from: number, to: number) => ((window = [from, to]), b),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return b;
  }
  const client = { from: (t: string) => builder(tables[t] ?? []) } as unknown as SupabaseClient;
  return { client, calls };
}

const ids = (n: number, prefix = "r") =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(6, "0")}`);

describe("fetchAll", () => {
  test("pages past the 1,000-row cap and returns every row exactly once, in order", async () => {
    // Insert shuffled so the result order comes from the requested sort.
    const rows = ids(2500).map((id, i) => ({ id, org_id: "o1", n: i }));
    const shuffled = [...rows].sort(() => Math.random() - 0.5);
    const { client, calls } = fakeDb({ t: shuffled });

    const res = await fetchAll<{ id: string }>(() => client.from("t").select("id").eq("org_id", "o1") as unknown as PageableQuery<{ id: string }>, {
      order: ["id"],
    });
    expect(res.error).toBeNull();
    expect(res.truncated).toBe(false);
    expect(res.data!.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    expect(calls.requests).toBe(3);
  });

  test("a small table costs exactly one request", async () => {
    const { client, calls } = fakeDb({ t: ids(300).map((id) => ({ id })) });
    const res = await fetchAll(() => client.from("t").select("id"), { order: ["id"] });
    expect(res.data).toHaveLength(300);
    expect(calls.requests).toBe(1);
  });

  test("exactly one full page needs a second (empty) request and is not truncated", async () => {
    const { client, calls } = fakeDb({ t: ids(1000).map((id) => ({ id })) });
    const res = await fetchAll(() => client.from("t").select("id"), { order: ["id"] });
    expect(res.data).toHaveLength(1000);
    expect(res.truncated).toBe(false);
    expect(calls.requests).toBe(2);
  });

  test("reports truncation at the hard cap instead of returning a silent undercount", async () => {
    const { client } = fakeDb({ t: ids(2500).map((id) => ({ id })) });
    const res = await fetchAll(() => client.from("t").select("id"), { order: ["id"], hardCap: 1500 });
    expect(res.truncated).toBe(true);
    expect(res.data).toHaveLength(1500);
  });

  test("respects descending sort keys", async () => {
    const { client } = fakeDb({ t: ids(1200).map((id) => ({ id })) });
    const res = await fetchAll<{ id: string }>(() => client.from("t").select("id"), {
      order: [{ column: "id", ascending: false }],
    });
    expect(res.data![0].id).toBe("r001199");
    expect(res.data![1199].id).toBe("r000000");
  });

  test("an error returns no rows rather than a partial set", async () => {
    let page = 0;
    const query = () => {
      const q: PageableQuery<{ id: string }> = {
        order: () => q,
        range: () => {
          page++;
          return Promise.resolve(
            page === 1
              ? { data: ids(1000).map((id) => ({ id })), error: null }
              : { data: null, error: { message: "boom" } }
          );
        },
      };
      return q;
    };
    const res = await fetchAll(query, { order: ["id"] });
    expect(res.data).toBeNull();
    expect(res.error).toEqual({ message: "boom" });
  });

  test("requires a stable order", async () => {
    const { client } = fakeDb({ t: [] });
    await expect(
      fetchAll(() => client.from("t").select("id"), { order: [] as unknown as ["id"] })
    ).rejects.toThrow(/order/);
  });
});

describe("loaders fixed for the 1,000-row cap", () => {
  test("loadReceivedTotal sums every gift in the window, not the first 1,000", async () => {
    const gifts = ids(2345, "g").map((id) => ({ id, org_id: "o1", amount: 10, gift_date: "2026-03-01" }));
    gifts.push({ id: "other", org_id: "o2", amount: 999, gift_date: "2026-03-01" });
    gifts.push({ id: "late", org_id: "o1", amount: 999, gift_date: "2027-03-01" });
    const { client } = fakeDb({ gifts });

    // The old shape (one unranged read) is silently capped by the server.
    const old = (await client.from("gifts").select("amount").eq("org_id", "o1").gte("gift_date", "2026-01-01").lte("gift_date", "2026-12-31")) as unknown as { data: { amount: number }[] };
    expect(old.data.reduce((s, g) => s + g.amount, 0)).toBe(10_000);

    const res = await loadReceivedTotal(client, "o1", "2026-01-01", "2026-12-31");
    expect(res).toEqual({ total: 23_450, truncated: false });
  });

  test("attendance_rate counts every mark past 1,000", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const sessions = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      org_id: "o1",
      cohort_id: "c1",
      status: "held",
      session_date: today,
    }));
    // 30 sessions x 60 students = 1,800 marks. The first 1,000 by id are all
    // present; the remaining 800 are absent. True rate: 1000 / 1800.
    const attendance = Array.from({ length: 1800 }, (_, i) => ({
      id: `a${String(i).padStart(6, "0")}`,
      org_id: "o1",
      session_id: `s${i % 30}`,
      status: i < 1000 ? "present" : "absent",
    }));
    const { client } = fakeDb({
      cohorts: [{ id: "c1", org_id: "o1", status: "active" }],
      cohort_sessions: sessions,
      attendance,
    });
    const rate = await METRIC_RESOLVERS.attendance_rate(client, "o1");
    expect(rate).toBeCloseTo((1000 / 1800) * 100, 6);
    // The old unpaged read would have seen only the first 1,000 (all present).
    expect(rate).not.toBe(100);
  });
});
