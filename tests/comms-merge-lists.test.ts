import { beforeEach, describe, expect, test } from "vitest";
import { fakeDb, type Row } from "./support/commsFakeDb";
import { checkMerge, mergeText, scanFields, EMPTY_MERGE, type MergeData } from "@/lib/comms/merge";
import { resolveRecipients, storableDefinition, parseSegmentDefinition, recipientMergeData } from "@/lib/fundraising/segments";
import { describeList, startOf, withStart, tidy } from "@/lib/comms/lists";

/**
 * Comms v3 (specs/comms-v3-composer.md): merge fields and hand-built lists.
 * These pin the two promises the composer makes: the preview is the email
 * (one merge function, fail closed on anything it can't fill), and a list
 * emails exactly the people it shows.
 */

const donor: MergeData = { first_name: "Ana", last_name: "Lopez", full_name: "Ana Lopez", last_gift: "2026-03-01", lifetime_total: 1250, gift_count: 3 };
const nameless: MergeData = { ...EMPTY_MERGE, full_name: "ana@example.org" };

describe("merge fields", () => {
  test("fills a person's own values", () => {
    const r = mergeText("Hi {{first_name|there}}, your gift on {{last_gift_date}} brought you to {{total_given}}.", donor);
    expect(r.text).toBe("Hi Ana, your gift on March 1, 2026 brought you to $1,250.");
    expect(r.missing).toEqual([]);
    expect(r.fellBack).toEqual([]);
  });

  test("uses the fallback words for someone with no value, and says so", () => {
    const r = mergeText("Hi {{ first_name | there }},", nameless);
    expect(r.text).toBe("Hi there,");
    expect(r.fellBack).toEqual(["first_name"]);
  });

  test("bare {{first_name}} keeps its old fallback, friend", () => {
    expect(mergeText("Hi {{first_name}},", EMPTY_MERGE).text).toBe("Hi friend,");
  });

  test("a field with no value and no fallback is reported missing, never sent blank silently", () => {
    const r = mergeText("Your last gift was {{last_gift_date}}.", nameless);
    expect(r.missing).toEqual(["last_gift_date"]);
  });

  test("a typo is caught as unknown, in any of the usual shapes", () => {
    expect(scanFields("Hi {{frist_name}}").unknown).toEqual(["{{frist_name}}"]);
    expect(scanFields("Hi {first_name}").unknown).toEqual(["{first_name}"]);
    expect(scanFields("Hi [First Name]").unknown).toEqual(["[First Name]"]);
    expect(scanFields("Hi {{first_name|there}}, see you soon.").unknown).toEqual([]);
  });

  test("the check blocks a typo and a gift field sent to people who never gave", () => {
    const check = checkMerge("Thank you {{frist_name}}", "Since {{last_gift_date}}", [donor, nameless]);
    expect(check.blockers).toHaveLength(2);
    expect(check.blockers[0]).toContain("{{frist_name}}");
    expect(check.blockers[1]).toContain("1 person");
  });

  test("the check notes who falls back, with the words they will see", () => {
    const check = checkMerge("Hello", "Hi {{first_name|there}},", [donor, nameless, nameless]);
    expect(check.blockers).toEqual([]);
    expect(check.notes).toEqual(['2 people have no first name and will see "there" instead.']);
  });
});

const ORG = "00000000-0000-0000-0000-00000000000a";
const OTHER = "00000000-0000-0000-0000-00000000000b";
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const person = (n: number, name: string, over: Partial<Row> = {}): Row => ({
  id: uid(n), org_id: ORG, type: "person", first_name: name, last_name: "Example", org_name: null,
  emails: [`${name.toLowerCase()}@example.org`], do_not_contact: false, archived_at: null,
  gift_count: 2, last_gift: "2026-03-01", lifetime_total: 500, recurring_active: false, tags: [], ...over,
});

let db = fakeDb({});
beforeEach(() => {
  db = fakeDb({
    v_fr_rollups: [
      person(1, "Ana"),
      person(2, "Ben", { gift_count: 0, last_gift: null, lifetime_total: 0 }),
      person(3, "Cy", { do_not_contact: true }),
      person(4, "Dee", { last_gift: "2024-06-01" }),
      person(5, "Eli", { archived_at: "2026-10-01T00:00:00Z" }),
      person(6, "Gus", { org_id: OTHER }),
    ],
    email_suppressions: [],
    fr_prospects: [],
    constituents: [],
  });
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolve = (def: unknown) => resolveRecipients(db.client as any, def, ORG, "2026-11-24");
const names = (r: Awaited<ReturnType<typeof resolve>>) => r.recipients.map((p) => p.firstName).sort();

describe("hand-built lists", () => {
  test("a hand-picked list is only the people added, in this org, not archived, and still honors do not contact", async () => {
    const r = await resolve({ picked_only: "1", include_ids: [uid(1), uid(3), uid(5), uid(6)] });
    expect(r.error).toBeUndefined();
    expect(names(r)).toEqual(["Ana"]);
    expect(r.excluded.doNotContact).toBe(1);
  });

  test("an empty hand-picked list emails nobody, with the reason", async () => {
    const r = await resolve({ picked_only: "1" });
    expect(r.recipients).toEqual([]);
    expect(r.error).toContain("no one on it");
  });

  test("rules plus people added by hand, minus people taken off by hand", async () => {
    const r = await resolve({ view: "donors", include_ids: [uid(2)], exclude_ids: [uid(4)] });
    expect(names(r)).toEqual(["Ana", "Ben"]);
    expect(r.recipients.find((p) => p.firstName === "Ben")?.added).toBe(true);
    expect(r.recipients.find((p) => p.firstName === "Ana")?.added).toBeUndefined();
    expect(r.handRemoved).toBe(1);
  });

  test("never gave, and last gift before a date", async () => {
    expect(names(await resolve({ never_gave: "1" }))).toEqual(["Ben"]);
    expect(names(await resolve({ view: "donors", before: "2025-01-01" }))).toEqual(["Dee"]);
  });

  test("ids that are not ids refuse the whole list, never a shorter one", async () => {
    const r = await resolve({ include_ids: ["not-an-id"] });
    expect(r.recipients).toEqual([]);
    expect(r.error).toBeTruthy();
    expect(parseSegmentDefinition({ exclude_ids: "x" }).ok).toBe(false);
  });

  test("recipients carry the data merge fields use", async () => {
    const r = await resolve({ picked_only: "1", include_ids: [uid(1)] });
    expect(recipientMergeData(r.recipients[0])).toEqual({
      first_name: "Ana", last_name: "Example", full_name: "Ana Example", last_gift: "2026-03-01", lifetime_total: 500, gift_count: 2,
    });
  });

  test("saving keeps the list keys and drops what it doesn't know", () => {
    const s = storableDefinition({ view: "donors", before: "2025-01-01", include_ids: [uid(1), uid(1)], picked_only: true, junk: "x" });
    expect(s).toEqual({ ok: true, definition: { view: "donors", before: "2025-01-01", include_ids: [uid(1)], picked_only: "1" } });
    expect(storableDefinition({ include_ids: ["nope"] }).ok).toBe(false);
  });
});

describe("list helpers", () => {
  test("starting points round-trip", () => {
    expect(startOf(withStart({}, "never"))).toBe("never");
    expect(startOf(withStart({ view: "donors" }, "all"))).toBe("all");
    expect(withStart({ view: "donors", min_total: "100", include_ids: [uid(1)] }, "picked")).toEqual({ include_ids: [uid(1)], exclude_ids: undefined, picked_only: "1" });
  });

  test("tidy drops empties", () => {
    expect(tidy({ view: "donors", tag: " ", include_ids: [] })).toEqual({ view: "donors" });
  });

  test("a list reads as one plain sentence", () => {
    expect(describeList({ view: "lapsed", min_total: "1000", exclude_ids: [uid(1)] })).toBe("Lapsed donors · gave $1,000 or more · 1 taken off by hand");
    expect(describeList({ picked_only: "1", include_ids: [uid(1), uid(2)] })).toBe("2 hand-picked people");
  });
});
