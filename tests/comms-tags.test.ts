import { beforeEach, describe, expect, test, vi } from "vitest";
import { fakeDb, type Row } from "./support/commsFakeDb";
import { changeTags, countTags, hasTag, isSystemTag, normalizeTag, normalizeTags, planTagWrites, renameInTags } from "@/lib/comms/tags";
import { resolveRecipients, parseSegmentDefinition, storableDefinition } from "@/lib/fundraising/segments";
import { hubspotSuppressions } from "@/lib/hubspot/upserts";
import { emailsIn } from "@/lib/admin/tags-server";
import { lifecycleTag, withLifecycleTag, syncLifecycleTags } from "@/lib/hubspot/lifecycle-tags";

/**
 * Tags on people, and HubSpot's bounces. These pin: one spelling per tag,
 * bulk changes that touch only the records that change, a list by tag emails
 * exactly the people carrying it, and an address HubSpot knows is dead never
 * reaches a send.
 */

describe("tag names", () => {
  test("cleaned to one form", () => {
    expect(normalizeTag("  Board   Member ")).toBe("Board Member");
    expect(normalizeTag("gala, 2026")).toBe("gala 2026");
    expect(normalizeTag("   ")).toBeNull();
    expect(normalizeTag(42)).toBeNull();
    expect(normalizeTag("x".repeat(60))).toHaveLength(40);
  });

  test("a list of tags drops repeats that differ only by case", () => {
    expect(normalizeTags(["Board", "board ", "", "Gala"])).toEqual(["Board", "Gala"]);
    expect(normalizeTags("Board")).toEqual([]);
  });
});

describe("changing tags on a record", () => {
  test("adding keeps the spelling already there", () => {
    expect(changeTags(["Board"], ["board", "Gala"], [])).toEqual(["Board", "Gala"]);
  });
  test("removing is case-insensitive", () => {
    expect(changeTags(["Board", "Gala"], [], ["BOARD"])).toEqual(["Gala"]);
  });
  test("rename, merge and delete", () => {
    expect(renameInTags(["board", "Gala"], "Board", "Trustee")).toEqual(["Trustee", "Gala"]);
    expect(renameInTags(["board", "Trustee"], "board", "Trustee")).toEqual(["Trustee"]);
    expect(renameInTags(["board", "Gala"], "board", null)).toEqual(["Gala"]);
  });
  test("hasTag ignores case", () => {
    expect(hasTag(["Board"], "board")).toBe(true);
    expect(hasTag(null, "board")).toBe(false);
  });
});

describe("bulk changes", () => {
  const rows = [
    { id: "a", tags: null },
    { id: "b", tags: [] },
    { id: "c", tags: ["Board"] },
    { id: "d", tags: ["Gala"] },
  ];
  test("only records that change are written, grouped by the tags they end with", () => {
    const plan = planTagWrites(rows, (t) => changeTags(t, ["Board"], []));
    expect(plan).toEqual([
      { tags: ["Board"], ids: ["a", "b"] },
      { tags: ["Gala", "Board"], ids: ["d"] },
    ]);
  });
  test("counts fold spellings together under the most common one", () => {
    expect(countTags([{ id: "1", tags: ["board"] }, { id: "2", tags: ["Board"] }, { id: "3", tags: ["Board", "Gala"] }])).toEqual([
      { tag: "Board", count: 3 },
      { tag: "Gala", count: 1 },
    ]);
  });
});

const ORG = "00000000-0000-0000-0000-00000000000a";
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const person = (n: number, name: string, over: Partial<Row> = {}): Row => ({
  id: uid(n), org_id: ORG, type: "person", first_name: name, last_name: "Example", org_name: null,
  emails: [`${name.toLowerCase()}@example.org`], do_not_contact: false, archived_at: null,
  gift_count: 1, last_gift: "2026-03-01", lifetime_total: 100, recurring_active: false, tags: [], ...over,
});

let db = fakeDb({});
beforeEach(() => {
  db = fakeDb({
    v_fr_rollups: [
      person(1, "Ana", { tags: ["Board"] }),
      person(2, "Ben", { tags: ["board", "Gala"] }),
      person(3, "Cy", { tags: ["Gala"], emails: [] }),
      person(4, "Dee"),
    ],
    email_suppressions: [], fr_prospects: [], constituents: [],
  });
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolve = (def: unknown) => resolveRecipients(db.client as any, def, ORG, "2026-11-24");

describe("lists by tag", () => {
  test("any of the tags, whatever the capitalization", async () => {
    const r = await resolve({ tags: ["Board"] });
    expect(r.recipients.map((p) => p.firstName).sort()).toEqual(["Ana", "Ben"]);
    const either = await resolve({ tags: ["board", "gala"] });
    expect(either.recipients.map((p) => p.firstName).sort()).toEqual(["Ana", "Ben"]);
    expect(either.excluded.noEmail).toBe(1);
  });

  test("tagging a list reaches the people who can't be emailed too", async () => {
    const r = await resolve({ tags: ["Gala"] });
    expect(r.recipients.map((p) => p.firstName)).toEqual(["Ben"]);
    expect(r.memberIds?.slice().sort()).toEqual([uid(2), uid(3)]);
  });

  test("unreadable tags refuse the list, never widen it", () => {
    expect(parseSegmentDefinition({ tags: "Board" }).ok).toBe(false);
    expect(parseSegmentDefinition({ tags: ["Board", 3] }).ok).toBe(false);
    expect(parseSegmentDefinition({ tags: ["Board", ","] }).ok).toBe(false);
  });

  test("saving keeps cleaned tags", () => {
    expect(storableDefinition({ tags: [" Board ", "board", "Gala"] })).toEqual({ ok: true, definition: { tags: ["Board", "Gala"] } });
  });
});

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => db.client }));

describe("HubSpot bounces and opt-outs", () => {
  const rec = (email: string | null, props: Record<string, string | null> = {}) => ({ id: "1", properties: { email, ...props } });
  test("a dead mailbox or an opt-out blocks the address; other bounce reasons do not", () => {
    expect(
      hubspotSuppressions([
        rec("Dead@Example.org", { hs_email_hard_bounce_reason_enum: "UNKNOWN_USER" }),
        rec("full@example.org", { hs_email_hard_bounce_reason_enum: "MAILBOX_FULL" }),
        rec("policy@example.org", { hs_email_hard_bounce_reason_enum: "POLICY" }),
        rec("out@example.org", { hs_email_optout: "true" }),
        rec("fine@example.org", { hs_email_optout: "false", hs_email_hard_bounce_reason_enum: null }),
        rec(null, { hs_email_hard_bounce_reason_enum: "UNKNOWN_USER" }),
      ])
    ).toEqual([
      { email: "dead@example.org", reason: "hard_bounce" },
      { email: "out@example.org", reason: "unsubscribed" },
    ]);
  });
});

describe("system tags", () => {
  test("AIG is left to the HubSpot sync", () => {
    expect(isSystemTag(" aig ")).toBe(true);
    expect(isSystemTag("Board")).toBe(false);
  });
});

describe("pasted addresses", () => {
  test("found wherever they sit, lowercased, once each", () => {
    expect(emailsIn('Ana <Ana@Example.org>, ben@example.org;\n"ana@example.org"\tnot-an-email')).toEqual(["ana@example.org", "ben@example.org"]);
  });
});

describe("HubSpot lifecycle stages as tags", () => {
  test("named as HubSpot names them, with a prefix", () => {
    expect(lifecycleTag("salesqualifiedlead")).toBe("HubSpot: Sales Qualified Lead");
    expect(lifecycleTag("customer")).toBe("HubSpot: Customer");
    expect(lifecycleTag("My Custom Stage")).toBe("HubSpot: My Custom Stage");
    expect(lifecycleTag("")).toBeNull();
    expect(lifecycleTag(null)).toBeNull();
  });

  test("one stage tag per person: the old one comes off, other tags stay put", () => {
    expect(withLifecycleTag(["Board", "HubSpot: Lead", "Gala"], "customer")).toEqual(["Board", "Gala", "HubSpot: Customer"]);
    expect(withLifecycleTag(null, "lead")).toEqual(["HubSpot: Lead"]);
    expect(withLifecycleTag(["Board", "HubSpot: Lead"], null)).toEqual(["Board"]);
  });

  test("already right means untouched, so a second sync writes nothing", () => {
    const tags = ["HubSpot: Lead", "Board"];
    expect(withLifecycleTag(tags, "lead")).toEqual(tags);
  });

  test("stage tags are system tags", () => {
    expect(isSystemTag("HubSpot: Lead")).toBe(true);
    expect(isSystemTag("hubspot: anything")).toBe(true);
    expect(isSystemTag("HubSpot fans")).toBe(false);
  });

  test("the sync tags only people linked to a HubSpot contact, in this org", async () => {
    const OTHER = "00000000-0000-0000-0000-00000000000b";
    db = fakeDb({
      hs_contacts: [
        { org_id: ORG, hubspot_id: "101", lifecycle_stage: "lead" },
        { org_id: ORG, hubspot_id: "102", lifecycle_stage: "customer" },
        { org_id: OTHER, hubspot_id: "999", lifecycle_stage: "customer" },
      ],
      constituents: [
        { id: uid(1), org_id: ORG, archived_at: null, tags: ["Board"], external_ids: { hubspot: "101" } },
        { id: uid(2), org_id: ORG, archived_at: null, tags: ["HubSpot: Lead"], external_ids: { hubspot: "102" } },
        { id: uid(3), org_id: ORG, archived_at: null, tags: ["Gala"], external_ids: {} },
        { id: uid(4), org_id: ORG, archived_at: null, tags: [], external_ids: { hubspot: "999" } },
        { id: uid(5), org_id: OTHER, archived_at: null, tags: [], external_ids: { hubspot: "999" } },
      ],
    });
    const r = await syncLifecycleTags(ORG);
    expect(r.error).toBeNull();
    const updates = db.writes.filter((w) => w.table === "constituents" && w.op === "update");
    const written = updates.map((w) => ({ tags: (w.values as { tags: string[] }).tags, ids: (w.filters.find((f) => f[0] === "in")?.[2] as string[]).slice().sort() }));
    expect(written).toEqual(
      expect.arrayContaining([
        { tags: ["Board", "HubSpot: Lead"], ids: [uid(1)] },
        { tags: ["HubSpot: Customer"], ids: [uid(2)] },
      ])
    );
    expect(written).toHaveLength(2);
    for (const w of updates) expect(w.filters).toEqual(expect.arrayContaining([["eq", "org_id", ORG]]));
  });
});
