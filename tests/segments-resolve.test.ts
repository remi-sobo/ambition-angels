import { describe, expect, test } from "vitest";
import { resolveRecipients } from "@/lib/fundraising/segments";
import { mockSupabase } from "./support/supabaseMock";

// Comms v2 Phase 1: the recipient resolver excludes suppressed addresses
// (email_suppressions) in addition to do-not-contact and missing-email, and
// reports per-reason exclusion counts so the UI can be honest about them.

type C = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[] | null;
  source: string | null;
  tags: string[] | null;
  do_not_contact: boolean;
};

const person = (id: string, over: Partial<C>): C => ({
  id,
  type: "person",
  first_name: "Ada",
  last_name: "Lovelace",
  org_name: null,
  emails: ["ada@example.com"],
  source: null,
  tags: null,
  do_not_contact: false,
  ...over,
});

describe("resolveRecipients", () => {
  test("excludes DNC, missing email, and suppressed — with counts", async () => {
    const constituents = [
      person("c1", { emails: ["ok@example.com"] }),
      person("c2", { do_not_contact: true }),
      person("c3", { emails: [] }),
      person("c4", { emails: ["Sup@Example.COM"] }),
    ];
    const { client } = mockSupabase([
      { data: constituents },
      { data: [{ email: "sup@example.com" }] }, // suppression list (citext, stored lowercase or not)
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { recipients, excluded } = await resolveRecipients(client as any, {});
    expect(recipients.map((r) => r.email)).toEqual(["ok@example.com"]);
    expect(excluded).toEqual({ doNotContact: 1, suppressed: 1, noEmail: 1 });
  });

  test("giving filters define membership; exclusions count only segment members", async () => {
    const constituents = [
      person("big", { emails: ["big@example.com"] }),
      person("small-dnc", { emails: ["small@example.com"], do_not_contact: true }),
    ];
    const gifts = [
      { constituent_id: "big", amount: 500, gift_date: "2026-01-15" },
      { constituent_id: "small-dnc", amount: 10, gift_date: "2026-02-01" },
    ];
    const { client } = mockSupabase([
      { data: constituents },
      { data: [] }, // no suppressions
      { data: gifts },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { recipients, excluded } = await resolveRecipients(client as any, { min_total: "100" });
    expect(recipients.map((r) => r.id)).toEqual(["big"]);
    // small-dnc fails the giving filter, so it is NOT counted as a DNC exclusion.
    expect(excluded).toEqual({ doNotContact: 0, suppressed: 0, noEmail: 0 });
  });

  test("suppression comparison is case-insensitive both ways", async () => {
    const { client } = mockSupabase([
      { data: [person("c1", { emails: ["MiXeD@Example.com"] })] },
      { data: [{ email: "mixed@EXAMPLE.com" }] },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { recipients, excluded } = await resolveRecipients(client as any, {});
    expect(recipients).toEqual([]);
    expect(excluded.suppressed).toBe(1);
  });
});
