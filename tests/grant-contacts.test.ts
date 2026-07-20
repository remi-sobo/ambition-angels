import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  addGrantContact,
  findOrCreatePersonContact,
  GRANT_CONTACT_ROLES,
  listGrantContacts,
  removeGrantContact,
  setPrimaryGrantContact,
} from "../lib/fundraising/grantContacts";

// Data-layer mechanics for grant_contacts: filter shapes, auto-primary,
// primary swap ordering, friendly constraint errors. The DB-side invariants
// (RLS org isolation, one-primary partial index, no-duplicate-link unique
// index) are exercised by the SQL harness in supabase/tests/rls-leak-test.sql.

const GRANT = "11111111-1111-1111-1111-111111111111";
const PERSON = "22222222-2222-2222-2222-222222222222";
const CONTACT = "33333333-3333-3333-3333-333333333333";
const ORG = "44444444-4444-4444-4444-444444444444";

/** One recorded query: the chained calls (method + args) and a canned result. */
type Call = { table: string; ops: Array<[string, unknown[]]> };

/**
 * A thenable chain recorder. Each `.from(table)` starts a fresh chain; every
 * chained method is recorded; awaiting the chain resolves the next canned
 * result from `script` (or `{ data: [], error: null, count: 0 }`).
 */
function fakeSupabase(script: Array<Record<string, unknown>> = []) {
  const calls: Call[] = [];
  let cursor = 0;
  const next = () => script[cursor++] ?? { data: [], error: null, count: 0 };
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    const record =
      (name: string) =>
      (...args: unknown[]) => {
        call.ops.push([name, args]);
        return chain;
      };
    for (const m of ["select", "insert", "update", "delete", "eq", "neq", "contains", "order", "limit"]) {
      chain[m] = record(m);
    }
    chain.single = () => {
      call.ops.push(["single", []]);
      return Promise.resolve(next());
    };
    chain.maybeSingle = () => {
      call.ops.push(["maybeSingle", []]);
      return Promise.resolve(next());
    };
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(next()).then(resolve);
    return chain;
  };
  return { sb: { from } as unknown as SupabaseClient, calls };
}

const ops = (c: Call) => c.ops.map(([name]) => name);
const opArgs = (c: Call, name: string) => c.ops.find(([n]) => n === name)?.[1];

describe("listGrantContacts", () => {
  test("filters by grant, embeds the constituent, primary first", async () => {
    const row = { id: CONTACT, is_primary: true, constituent: { id: PERSON } };
    const { sb, calls } = fakeSupabase([{ data: [row], error: null }]);
    const res = await listGrantContacts(sb, GRANT);
    expect(res).toEqual({ contacts: [row] });
    expect(calls[0].table).toBe("grant_contacts");
    expect(String(opArgs(calls[0], "select")?.[0])).toContain("constituent:constituents(");
    expect(opArgs(calls[0], "eq")).toEqual(["grant_id", GRANT]);
    expect(opArgs(calls[0], "order")).toEqual(["is_primary", { ascending: false }]);
  });

  test("surfaces the DB error", async () => {
    const { sb } = fakeSupabase([{ data: null, error: { message: "boom" } }]);
    expect(await listGrantContacts(sb, GRANT)).toEqual({ error: "boom" });
  });
});

describe("addGrantContact", () => {
  test("first contact on a grant becomes primary automatically", async () => {
    const { sb, calls } = fakeSupabase([
      { count: 0, data: [], error: null }, // existing-contact count
      { data: { id: CONTACT, is_primary: true }, error: null }, // insert
    ]);
    const res = await addGrantContact(sb, ORG, { grantId: GRANT, constituentId: PERSON });
    expect("contact" in res).toBe(true);
    const inserted = opArgs(calls[1], "insert")?.[0] as Record<string, unknown>;
    expect(inserted.is_primary).toBe(true);
    expect(inserted.org_id).toBe(ORG);
    expect(inserted.grant_id).toBe(GRANT);
    expect(inserted.constituent_id).toBe(PERSON);
  });

  test("later contacts stay non-primary unless asked", async () => {
    const { sb, calls } = fakeSupabase([
      { count: 2, data: [], error: null },
      { data: { id: CONTACT, is_primary: false }, error: null },
    ]);
    await addGrantContact(sb, ORG, { grantId: GRANT, constituentId: PERSON, role: "intro_source" });
    const inserted = opArgs(calls[1], "insert")?.[0] as Record<string, unknown>;
    expect(inserted.is_primary).toBe(false);
    expect(inserted.role).toBe("intro_source");
  });

  test("an explicit primary demotes the current one first", async () => {
    const { sb, calls } = fakeSupabase([
      { data: [], error: null }, // clear-primary update
      { data: { id: CONTACT, is_primary: true }, error: null }, // insert
    ]);
    await addGrantContact(sb, ORG, { grantId: GRANT, constituentId: PERSON, isPrimary: true });
    expect(ops(calls[0])).toContain("update");
    expect(opArgs(calls[0], "update")?.[0]).toEqual({ is_primary: false });
    expect(calls[0].ops).toContainEqual(["eq", ["grant_id", GRANT]]);
    expect(calls[0].ops).toContainEqual(["eq", ["is_primary", true]]);
    expect(ops(calls[1])).toContain("insert");
  });

  test("a duplicate link comes back as a friendly 409", async () => {
    const { sb } = fakeSupabase([
      { count: 1, data: [], error: null },
      { data: null, error: { code: "23505", message: "duplicate key" } },
    ]);
    const res = await addGrantContact(sb, ORG, { grantId: GRANT, constituentId: PERSON });
    expect(res).toEqual({
      error: "That person is already a contact on this grant.",
      status: 409,
    });
  });
});

describe("setPrimaryGrantContact", () => {
  test("demotes the old primary (sparing the target), then promotes", async () => {
    const { sb, calls } = fakeSupabase([
      { data: [], error: null }, // demote
      { data: [{ id: CONTACT }], error: null }, // promote
    ]);
    const res = await setPrimaryGrantContact(sb, GRANT, CONTACT);
    expect(res).toEqual({ ok: true });
    expect(opArgs(calls[0], "update")?.[0]).toEqual({ is_primary: false });
    expect(opArgs(calls[0], "neq")).toEqual(["id", CONTACT]);
    expect(opArgs(calls[1], "update")?.[0]).toEqual({ is_primary: true });
    // The promote is pinned to BOTH the contact id and the grant — a contact
    // id from another grant can never be promoted here.
    expect(calls[1].ops).toContainEqual(["eq", ["id", CONTACT]]);
    expect(calls[1].ops).toContainEqual(["eq", ["grant_id", GRANT]]);
  });

  test("promoting a contact that isn't on the grant is a 404", async () => {
    const { sb } = fakeSupabase([
      { data: [], error: null },
      { data: [], error: null }, // promote matched nothing
    ]);
    const res = await setPrimaryGrantContact(sb, GRANT, CONTACT);
    expect(res).toEqual({ error: "Contact not found.", status: 404 });
  });

  test("a lost primary race surfaces as a retryable error", async () => {
    const { sb } = fakeSupabase([
      { data: [], error: null },
      { data: null, error: { code: "23505", message: "unique" } },
    ]);
    const res = await setPrimaryGrantContact(sb, GRANT, CONTACT);
    expect("error" in res && res.error).toContain("try again");
  });
});

describe("removeGrantContact", () => {
  test("unlinks by id — never touches constituents", async () => {
    const { sb, calls } = fakeSupabase([{ data: [{ id: CONTACT }], error: null }]);
    const res = await removeGrantContact(sb, CONTACT);
    expect(res).toEqual({ removed: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("grant_contacts");
    expect(ops(calls[0])).toContain("delete");
    expect(opArgs(calls[0], "eq")).toEqual(["id", CONTACT]);
  });

  test("an already-removed contact reports removed:false", async () => {
    const { sb } = fakeSupabase([{ data: [], error: null }]);
    expect(await removeGrantContact(sb, CONTACT)).toEqual({ removed: false });
  });
});

describe("findOrCreatePersonContact", () => {
  test("matches an existing person by email (case-folded) before creating", async () => {
    const { sb, calls } = fakeSupabase([{ data: { id: PERSON }, error: null }]);
    const res = await findOrCreatePersonContact(sb, ORG, {
      firstName: "Dana",
      email: "Dana@Funder.org",
    });
    expect(res).toEqual({ id: PERSON });
    expect(calls).toHaveLength(1);
    expect(calls[0].ops).toContainEqual(["eq", ["type", "person"]]);
    expect(opArgs(calls[0], "contains")).toEqual(["emails", ["dana@funder.org"]]);
  });

  test("creates a person constituent in the caller's org when no match", async () => {
    const { sb, calls } = fakeSupabase([
      { data: null, error: null }, // email lookup misses
      { data: { id: PERSON }, error: null }, // insert
    ]);
    const res = await findOrCreatePersonContact(sb, ORG, {
      firstName: "Dana",
      lastName: "Officer",
      email: "dana@funder.org",
    });
    expect(res).toEqual({ id: PERSON });
    const inserted = opArgs(calls[1], "insert")?.[0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      org_id: ORG,
      type: "person",
      first_name: "Dana",
      last_name: "Officer",
      emails: ["dana@funder.org"],
      source: "manual",
    });
  });

  test("no email → straight to create (no lookup to mis-match)", async () => {
    const { sb, calls } = fakeSupabase([{ data: { id: PERSON }, error: null }]);
    await findOrCreatePersonContact(sb, ORG, { firstName: "Dana" });
    expect(calls).toHaveLength(1);
    expect(ops(calls[0])).toContain("insert");
  });
});

describe("suggested roles", () => {
  test("the seeded set matches the product spec", () => {
    expect(GRANT_CONTACT_ROLES.map(([v]) => v)).toEqual([
      "intro_source",
      "program_officer",
      "primary",
      "finance_reporting",
      "other",
    ]);
  });
});
