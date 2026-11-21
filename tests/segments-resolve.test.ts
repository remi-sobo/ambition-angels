import { describe, expect, test } from "vitest";
import { matchesView, type RollupRow as ViewRollupRow } from "@/lib/fundraising/views";
import { parseSegmentDefinition, resolveRecipients } from "@/lib/fundraising/segments";
import { fakeDb } from "./support/fakeDb";

// The Comms recipient resolver. Comms v2 Phase 1: excludes suppressed
// addresses (email_suppressions) in addition to do-not-contact and
// missing-email, and reports per-reason exclusion counts so the UI can be
// honest about them. v4 phase 0 (C-1, C-4, C-5): a saved view resolves to
// that view's members through the Donors & Funders filters, archived
// constituents are never members, giving totals come from the database
// rollup (paged past max-rows), and anything unknown resolves to nobody.
//
// These run on the in-memory fakeDb, so the filters actually apply to rows:
// a resolver that ignored a key would return the wrong people here.

const ORG = "org-a";
const OTHER = "org-b";
const TODAY = "2026-11-20";

type R = {
  id: string;
  org_id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[] | null;
  tags: string[] | null;
  do_not_contact: boolean;
  archived_at: string | null;
  lifetime_total: number;
  gift_count: number;
  first_gift: string | null;
  last_gift: string | null;
  recurring_active: boolean;
};

// A v_fr_rollups row (the database view the resolver reads).
const row = (id: string, over: Partial<R> = {}): R => ({
  id,
  org_id: ORG,
  type: "person",
  first_name: "Ada",
  last_name: "Lovelace",
  org_name: null,
  emails: [`${id}@example.com`],
  tags: null,
  do_not_contact: false,
  archived_at: null,
  lifetime_total: 0,
  gift_count: 0,
  first_gift: null,
  last_gift: null,
  recurring_active: false,
  ...over,
});

function world(rollups: R[], extra: Record<string, Record<string, unknown>[]> = {}) {
  return fakeDb(
    {
      v_fr_rollups: rollups,
      constituents: rollups.map((r) => ({ id: r.id, org_id: r.org_id, source: null, is_volunteer: false })),
      email_suppressions: [],
      fr_prospects: [],
      ...extra,
    },
    { maxRows: 1000 }
  );
}

const ids = (r: { recipients: { id: string }[] }) => r.recipients.map((x) => x.id).sort();

describe("resolveRecipients", () => {
  test("excludes DNC, missing email, and suppressed, with counts", async () => {
    const db = world([], {});
    db.tables.v_fr_rollups = [
      row("c1", { emails: ["ok@example.com"] }),
      row("c2", { do_not_contact: true }),
      row("c3", { emails: [] }),
      row("c4", { emails: ["Sup@Example.COM"] }),
    ];
    // suppression list (citext, stored lowercase or not)
    db.tables.email_suppressions = [{ org_id: ORG, email: "sup@example.com" }];
    const { recipients, excluded, error } = await resolveRecipients(db.client, {}, ORG, TODAY);
    expect(error).toBeUndefined();
    expect(recipients.map((r) => r.email)).toEqual(["ok@example.com"]);
    expect(excluded).toEqual({ doNotContact: 1, suppressed: 1, noEmail: 1 });
  });

  test("giving filters define membership; exclusions count only segment members", async () => {
    const db = world([
      row("big", { lifetime_total: 500, gift_count: 1, last_gift: "2026-01-15" }),
      row("small-dnc", { lifetime_total: 10, gift_count: 1, last_gift: "2026-02-01", do_not_contact: true }),
    ]);
    const { recipients, excluded } = await resolveRecipients(db.client, { min_total: "100" }, ORG, TODAY);
    expect(recipients.map((r) => r.id)).toEqual(["big"]);
    // small-dnc fails the giving filter, so it is NOT counted as a DNC exclusion.
    expect(excluded).toEqual({ doNotContact: 0, suppressed: 0, noEmail: 0 });
  });

  test("suppression comparison is case-insensitive both ways", async () => {
    const db = world([row("c1", { emails: ["MiXeD@Example.com"] })], {
      email_suppressions: [{ org_id: ORG, email: "mixed@EXAMPLE.com" }],
    });
    const { recipients, excluded } = await resolveRecipients(db.client, {}, ORG, TODAY);
    expect(recipients).toEqual([]);
    expect(excluded.suppressed).toBe(1);
  });

  // C-1: the P0. A saved Lapsed / Recurring / Donors view must email that
  // view's members, not every constituent with an email.
  describe("saved views resolve to the view's members, not everyone", () => {
    const rollups = [
      row("lapsed", { gift_count: 2, lifetime_total: 300, last_gift: "2025-06-01" }),
      row("current", { gift_count: 1, lifetime_total: 50, last_gift: "2026-03-01" }),
      row("recurring", { gift_count: 5, lifetime_total: 250, last_gift: "2026-10-01", recurring_active: true }),
      row("never-gave"),
    ];

    for (const view of ["lapsed", "recurring", "donors", "all"] as const) {
      test(`view=${view} matches matchesView() exactly`, async () => {
        const db = world(rollups);
        const res = await resolveRecipients(db.client, { view }, ORG, TODAY);
        expect(res.error).toBeUndefined();
        const expected = rollups
          .filter((r) => matchesView(r as unknown as ViewRollupRow, view, TODAY))
          .map((r) => r.id)
          .sort();
        expect(ids(res)).toEqual(expected);
      });
    }

    test("lapsed is only the lapsed donor", async () => {
      const db = world(rollups);
      expect(ids(await resolveRecipients(db.client, { view: "lapsed" }, ORG, TODAY))).toEqual(["lapsed"]);
    });

    test("a view combines with the other keys", async () => {
      const db = world(rollups);
      const res = await resolveRecipients(db.client, { view: "donors", min_total: "200" }, ORG, TODAY);
      expect(ids(res)).toEqual(["lapsed", "recurring"]);
    });

    test("volunteers and promoted resolve through their id sets", async () => {
      const db = world(rollups);
      db.tables.constituents.find((c) => c.id === "never-gave")!.is_volunteer = true;
      db.tables.fr_prospects = [
        { org_id: ORG, status: "promoted", constituent_id: "current" },
        { org_id: ORG, status: "active", constituent_id: "lapsed" },
      ];
      expect(ids(await resolveRecipients(db.client, { view: "volunteers" }, ORG, TODAY))).toEqual(["never-gave"]);
      expect(ids(await resolveRecipients(db.client, { view: "promoted" }, ORG, TODAY))).toEqual(["current"]);
    });

    test("V1 keys still narrow: source, tag, since", async () => {
      const db = world([
        row("a", { tags: ["gala"], last_gift: "2026-05-01", gift_count: 1 }),
        row("b", { tags: ["gala"], last_gift: "2024-05-01", gift_count: 1 }),
        row("c", { last_gift: "2026-05-01", gift_count: 1 }),
      ]);
      db.tables.constituents.find((c) => c.id === "a")!.source = "stripe";
      db.tables.constituents.find((c) => c.id === "c")!.source = "stripe";
      expect(ids(await resolveRecipients(db.client, { tag: "gala", since: "2026-01-01" }, ORG, TODAY))).toEqual(["a"]);
      expect(ids(await resolveRecipients(db.client, { source: "stripe" }, ORG, TODAY))).toEqual(["a", "c"]);
    });
  });

  describe("fails closed", () => {
    const rollups = [row("x"), row("y")];
    const cases: [string, unknown][] = [
      ["unknown key", { view: "lapsed", gave_in_fy: "2025" }],
      ["unknown view", { view: "major_donors" }],
      ["prospects view", { view: "prospects" }],
      ["bad type", { type: "household" }],
      ["bad min_total", { min_total: "lots" }],
      ["bad since", { since: "last year" }],
      ["non-string value", { min_total: 100 }],
      ["not an object", ["view", "lapsed"]],
    ];
    for (const [label, def] of cases) {
      test(`${label} resolves to nobody with an error`, async () => {
        const db = world(rollups);
        const res = await resolveRecipients(db.client, def, ORG, TODAY);
        expect(res.recipients).toEqual([]);
        expect(res.error).toMatch(/\S/);
      });
    }

    test("parseSegmentDefinition names the unknown key", () => {
      const p = parseSegmentDefinition({ bogus: "1" });
      expect(p.ok).toBe(false);
      if (!p.ok) expect(p.error).toContain("bogus");
    });

    test("a failed read is an error, not an empty or wider list", async () => {
      const db = world(rollups);
      const client = {
        from: (t: string) => {
          const b = db.client.from(t);
          if (t !== "v_fr_rollups") return b;
          const failing = new Proxy(b, {
            get(target, prop) {
              if (prop === "range") return () => Promise.resolve({ data: null, error: { message: "boom" } });
              const v = target[prop as keyof typeof target];
              return typeof v === "function" ? (...a: unknown[]) => (v.apply(target, a), failing) : v;
            },
          });
          return failing;
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await resolveRecipients(client as any, {}, ORG, TODAY);
      expect(res.recipients).toEqual([]);
      expect(res.error).toMatch(/Nothing was sent/);
    });
  });

  // C-4
  test("archived constituents are never recipients, in any view", async () => {
    const db = world([
      row("live", { gift_count: 1, last_gift: "2025-01-01", lifetime_total: 10 }),
      row("gone", { gift_count: 1, last_gift: "2025-01-01", lifetime_total: 10, archived_at: "2026-01-01T00:00:00Z" }),
    ]);
    for (const def of [{}, { view: "lapsed" }, { view: "donors" }]) {
      const res = await resolveRecipients(db.client, def, ORG, TODAY);
      expect(ids(res)).toEqual(["live"]);
      // Archived is not a member, so not an exclusion either.
      expect(res.excluded).toEqual({ doNotContact: 0, suppressed: 0, noEmail: 0 });
    }
  });

  test("org pinning: another org's constituents and suppressions never apply", async () => {
    const db = world(
      [row("mine", { emails: ["shared@example.com"] }), row("theirs", { org_id: OTHER }), row("theirs-lapsed", { org_id: OTHER, gift_count: 1, last_gift: "2025-01-01" })],
      { email_suppressions: [{ org_id: OTHER, email: "shared@example.com" }] }
    );
    db.tables.constituents.push({ id: "theirs-vol", org_id: OTHER, source: "stripe", is_volunteer: true });
    expect(ids(await resolveRecipients(db.client, {}, ORG, TODAY))).toEqual(["mine"]);
    expect(ids(await resolveRecipients(db.client, { view: "lapsed" }, ORG, TODAY))).toEqual([]);
    expect(ids(await resolveRecipients(db.client, { view: "volunteers" }, ORG, TODAY))).toEqual([]);
    expect(ids(await resolveRecipients(db.client, {}, OTHER, TODAY))).toEqual(["theirs", "theirs-lapsed"]);
  });

  // C-5: past PostgREST max-rows (1,000 here, like Supabase) nothing is
  // silently dropped, and the order is stable.
  test("pages past max-rows deterministically", async () => {
    const many = Array.from({ length: 2345 }, (_, i) => row(`c${String(i).padStart(5, "0")}`));
    const db = world([...many].reverse());
    const a = await resolveRecipients(db.client, {}, ORG, TODAY);
    const b = await resolveRecipients(db.client, {}, ORG, TODAY);
    expect(a.recipients).toHaveLength(2345);
    expect(a.recipients.map((r) => r.id)).toEqual(b.recipients.map((r) => r.id));
    expect(a.recipients[0].id).toBe("c00000");
  });
});
