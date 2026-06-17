import { describe, expect, test } from "vitest";
import { promoteHsContact } from "../lib/fundraising/promote-hs-contact";
import { mockSupabase } from "./support/supabaseMock";

describe("promoteHsContact", () => {
  test("empty id → 400", async () => {
    const { client } = mockSupabase([]);
    expect(await promoteHsContact(client, "")).toEqual({ error: expect.any(String), status: 400 });
  });

  test("already linked → returns the existing constituent", async () => {
    const { client, calls } = mockSupabase([{ data: { id: "c1" } }]);
    expect(await promoteHsContact(client, "hs1")).toEqual({ constituentId: "c1" });
    expect(calls.insert.length).toBe(0);
  });

  test("mirror row missing → 404", async () => {
    const { client } = mockSupabase([{ data: null }, { data: null }]);
    expect(await promoteHsContact(client, "ghost")).toEqual({ error: expect.any(String), status: 404 });
  });

  test("email match stamps the hubspot id on the existing constituent", async () => {
    const { client, calls } = mockSupabase([
      { data: null }, // not linked
      { data: { hubspot_id: "hs2", email: "Donor@X.org", first_name: "D", last_name: "R" } },
      { data: { id: "c2", external_ids: {} } }, // matched by email
      {}, // update
    ]);
    expect(await promoteHsContact(client, "hs2")).toEqual({ constituentId: "c2" });
    expect(calls.update.length).toBe(1);
    expect((calls.update[0] as { external_ids: Record<string, unknown> }).external_ids).toMatchObject({
      hubspot: "hs2",
    });
  });

  test("no link and no email match → creates from the mirror fields", async () => {
    const { client, calls } = mockSupabase([
      { data: null }, // not linked
      { data: { hubspot_id: "hs3", email: null, first_name: "New", last_name: "Funder" } },
      { data: { id: "c3" }, error: null }, // insert
    ]);
    expect(await promoteHsContact(client, "hs3")).toEqual({ constituentId: "c3" });
    expect(calls.insert.length).toBe(1);
    expect((calls.insert[0] as { external_ids: Record<string, unknown> }).external_ids).toMatchObject({
      hubspot: "hs3",
    });
  });
});
