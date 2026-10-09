import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CAPTURE_MATCH_RPC, findCandidates } from "@/lib/capture/match";
import { CANDIDATES_PER_SPAN, CONTEXT_PRIOR_SIM } from "@/lib/capture/constants";

// Capture C2 step 4. The RPC is faked per span; what is tested is the merge:
// dedupe by (kind, id), best similarity wins, refs in similarity order, the
// span map, and the context prior.

type Row = { id: string; kind: string; name: string; org_name: string | null; meta: string | null; sim: number };

function fakeSupabase(bySpan: Record<string, Row[]>, failSpan?: string) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (args.q === failSpan) return { data: null, error: { message: "boom" } };
      return { data: bySpan[String(args.q)] ?? [], error: null };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const kendra1: Row = { id: "k1", kind: "constituent", name: "Kendra Sobomehin", org_name: null, meta: "person", sim: 0.6 };
const kendra2: Row = { id: "k2", kind: "constituent", name: "Kendra Sobomehin", org_name: null, meta: "person", sim: 0.58 };
const koshland: Row = { id: "p1", kind: "partner", name: "Koshland Foundation", org_name: null, meta: "nonprofit", sim: 0.9 };
const koshlandOrg: Row = { id: "o1", kind: "constituent", name: "Koshland Foundation", org_name: "Koshland Foundation", meta: "organization", sim: 0.95 };
const prospect: Row = { id: "pr1", kind: "prospect", name: "Kendra Prospect", org_name: null, meta: "prospect", sim: 0.4 };

describe("findCandidates", () => {
  test("calls the RPC once per distinct span with the org pinned", async () => {
    const { client, calls } = fakeSupabase({});
    await findCandidates(client, "org-1", ["Kendra", "kendra", "Koshland Foundation", " ", "x"]);
    expect(calls.map((c) => c.name)).toEqual([CAPTURE_MATCH_RPC, CAPTURE_MATCH_RPC]);
    expect(calls[0].args).toEqual({ q: "Kendra", org: "org-1", lim: CANDIDATES_PER_SPAN });
  });

  test("merges, dedupes, ranks, and maps spans to refs", async () => {
    const { client } = fakeSupabase({
      Kendra: [kendra1, kendra2, prospect],
      "Koshland Foundation": [koshlandOrg, koshland],
      Koshland: [{ ...koshland, sim: 0.7 }],
    });
    const { candidates, spanMap } = await findCandidates(client, "org-1", ["Kendra", "Koshland Foundation", "Koshland"]);
    expect(candidates.map((c) => [c.ref, c.id, c.sim])).toEqual([
      ["c1", "o1", 0.95],
      ["c2", "p1", 0.9],
      ["c3", "k1", 0.6],
      ["c4", "k2", 0.58],
      ["c5", "pr1", 0.4],
    ]);
    // The partner answered two spans; the best similarity is kept.
    expect(candidates[1].spans).toEqual(["Koshland Foundation", "Koshland"]);
    expect(spanMap).toEqual({
      Kendra: ["c3", "c4", "c5"],
      "Koshland Foundation": ["c1", "c2"],
      Koshland: ["c2"],
    });
    expect(candidates.every((c) => ["constituent", "partner", "prospect"].includes(c.kind))).toBe(true);
  });

  test("a failing span degrades to no candidates for that span, not a thrown parse", async () => {
    const { client } = fakeSupabase({ Kendra: [kendra1] }, "Nobody");
    const { candidates, spanMap } = await findCandidates(client, "org-1", ["Kendra", "Nobody"]);
    expect(candidates).toHaveLength(1);
    expect(spanMap.Nobody).toEqual([]);
  });

  test("the context entity is injected with the prior when absent", async () => {
    const { client } = fakeSupabase({ Kendra: [kendra1] });
    const { candidates } = await findCandidates(client, "org-1", ["Kendra"], {
      type: "partner",
      id: "p1",
      name: "Koshland Foundation",
      orgName: null,
      meta: "nonprofit",
    });
    expect(candidates[0]).toMatchObject({ ref: "c1", id: "p1", kind: "partner", sim: CONTEXT_PRIOR_SIM, context: true, spans: [] });
    expect(candidates[1]).toMatchObject({ ref: "c2", id: "k1", context: false });
  });

  test("the context entity is boosted and flagged when the RPC already returned it", async () => {
    const { client } = fakeSupabase({ Kendra: [kendra1, kendra2] });
    const { candidates } = await findCandidates(client, "org-1", ["Kendra"], {
      type: "constituent",
      id: "k2",
      name: "Kendra Sobomehin",
      orgName: null,
      meta: "person",
    });
    expect(candidates[0]).toMatchObject({ id: "k2", sim: CONTEXT_PRIOR_SIM, context: true, spans: ["Kendra"] });
    expect(candidates).toHaveLength(2);
  });

  test("unknown kinds from the RPC are ignored (never a student)", async () => {
    const { client } = fakeSupabase({ Kendra: [{ ...kendra1, kind: "student" }, kendra2] });
    const { candidates } = await findCandidates(client, "org-1", ["Kendra"]);
    expect(candidates.map((c) => c.id)).toEqual(["k2"]);
  });
});
