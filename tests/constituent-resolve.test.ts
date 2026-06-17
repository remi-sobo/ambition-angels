import { describe, expect, test } from "vitest";
import { resolveConstituent } from "../lib/fundraising/constituent-resolve";
import { mockSupabase } from "./support/supabaseMock";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("resolveConstituent", () => {
  test("explicit constituent id passes straight through (no query)", async () => {
    const { client, calls } = mockSupabase([]);
    const r = await resolveConstituent(client, { constituentId: UUID });
    expect(r).toEqual({ constituentId: UUID });
    expect(calls.or.length).toBe(0);
  });

  test("no id and no name → 400", async () => {
    const { client } = mockSupabase([]);
    const r = await resolveConstituent(client, {});
    expect(r).toEqual({ error: expect.any(String), status: 400 });
  });

  test("single match links it", async () => {
    const { client } = mockSupabase([{ data: [{ id: "c1" }] }]);
    expect(await resolveConstituent(client, { name: "Jane Doe" })).toEqual({ constituentId: "c1" });
  });

  test("multiple matches link the first with a warning", async () => {
    const { client } = mockSupabase([{ data: [{ id: "a" }, { id: "b" }] }]);
    const r = await resolveConstituent(client, { name: "Common Name" });
    expect(r).toMatchObject({ constituentId: "a" });
    expect("warning" in r && r.warning).toBeTruthy();
  });

  test("no match creates a new constituent", async () => {
    const { client, calls } = mockSupabase([{ data: [] }, { data: { id: "new" }, error: null }]);
    const r = await resolveConstituent(client, { name: "Brand New Funder" });
    expect(r).toMatchObject({ constituentId: "new" });
    expect(calls.insert.length).toBe(1);
  });

  test("sanitizes filter-breaking characters in the name before matching", async () => {
    const { client, calls } = mockSupabase([{ data: [] }, { data: { id: "x" }, error: null }]);
    await resolveConstituent(client, { name: "Foo, Bar (Inc)*" });
    // The grammar of or() uses commas/parens, but the injected VALUE must be
    // clean: no star, and the parenthesized fragment must not survive verbatim.
    expect(calls.or[0]).not.toContain("*");
    expect(calls.or[0]).not.toContain("(Inc)");
  });
});
