import { beforeEach, describe, expect, test, vi } from "vitest";

// A HubSpot 403 (missing private-app scope) on ONE engagement subtype — the
// real-world case is emails needing "sales-email-read" — must not abort the
// whole engagements step: the remaining subtypes still sync, and the job
// records an actionable missing_scope error instead of the raw API body.

vi.mock("../lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));
vi.mock("../lib/hubspot/fetchers", () => ({
  ENGAGEMENT_SUBTYPES: ["emails", "calls", "meetings", "notes", "tasks"],
  fetchContacts: vi.fn(),
  fetchCompanies: vi.fn(),
  fetchDeals: vi.fn(),
  fetchEngagements: vi.fn(),
}));
vi.mock("../lib/hubspot/upserts", () => ({
  upsertContacts: vi.fn(),
  upsertCompanies: vi.fn(),
  upsertDeals: vi.fn(),
  upsertEngagements: vi.fn(),
}));

import { getSupabaseAdmin } from "../lib/supabase/admin";
import { fetchEngagements } from "../lib/hubspot/fetchers";
import { upsertEngagements } from "../lib/hubspot/upserts";
import { HubSpotError } from "../lib/hubspot/client";
import {
  runChunk,
  missingScopeMessage,
  type JobRow,
} from "../lib/hubspot/sync-engine";

// Chainable stub for the two tables + rpc the engine touches. saveJob reads
// back `{...job, ...patch}` so the returned JobRow reflects the update.
function stubAdmin(base: () => Record<string, unknown>) {
  return {
    from: (table: string) => {
      if (table === "imports") {
        return { upsert: async () => ({ error: null }) };
      }
      let patch: Record<string, unknown> = {};
      const chain = {
        update(p: Record<string, unknown>) {
          patch = p;
          return chain;
        },
        eq: () => chain,
        select: () => chain,
        single: async () => ({ data: { ...base(), ...patch }, error: null }),
      };
      return chain;
    },
    rpc: async () => ({ error: null }),
  };
}

const engagementsJob = (): JobRow => ({
  id: "job-1",
  org_id: "org-1",
  started_at: "2026-07-30T00:00:00.000Z",
  finished_at: null,
  status: "running",
  triggered_by: null,
  current_step: "engagements",
  cursors: { contacts: null, companies: null, deals: null, engagements: null },
  counts: { contacts: 2, companies: 2, deals: 2, engagements: 0 },
  errors: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSupabaseAdmin).mockReturnValue(stubAdmin(engagementsJob) as never);
  vi.mocked(upsertEngagements).mockImplementation(async (_subtype, records) => ({
    inserted: records.length,
    failed: [],
  }));
});

describe("engagements sync — missing-scope 403 on one subtype", () => {
  test("emails 403 is contained: other subtypes still sync, actionable error recorded, run is partial", async () => {
    vi.mocked(fetchEngagements).mockImplementation(async (subtype) => {
      if (subtype === "emails") {
        throw new HubSpotError(
          403,
          '{"status":"error","message":"This app hasn\'t been granted all required scopes to make this call."}',
          "/crm/v3/objects/emails?limit=100"
        );
      }
      return {
        records: [{ id: `${subtype}-1`, properties: {} }],
        nextCursor: null,
      };
    });

    const job = await runChunk(engagementsJob());

    // All five subtypes were attempted — the 403 did not end the step.
    const subtypesTried = vi.mocked(fetchEngagements).mock.calls.map((c) => c[0]);
    expect(subtypesTried).toEqual(["emails", "calls", "meetings", "notes", "tasks"]);

    // calls + meetings + notes + tasks landed.
    expect(job.counts.engagements).toBe(4);

    // Honest status: the spine is missing emails, so the run is partial…
    expect(job.status).toBe("partial");

    // …with an actionable, tagged error instead of the raw API body.
    expect(job.errors).toHaveLength(1);
    const err = job.errors[0];
    expect(err.step).toBe("engagements");
    expect(err.subtype).toBe("emails");
    expect(err.kind).toBe("missing_scope");
    expect(err.message).toContain("sales-email-read");
    expect(err.message).toContain("Private Apps");
    expect(err.message).not.toContain("correlationId");
  });

  test("a non-403 HubSpot error keeps the old contract: step aborts with the raw message", async () => {
    vi.mocked(fetchEngagements).mockRejectedValue(
      new HubSpotError(500, "boom", "/crm/v3/objects/emails")
    );

    const job = await runChunk(engagementsJob());

    expect(vi.mocked(fetchEngagements)).toHaveBeenCalledTimes(1);
    expect(job.status).toBe("partial");
    expect(job.errors).toHaveLength(1);
    expect(job.errors[0].kind).toBeUndefined();
    expect(job.errors[0].message).toContain("HubSpot 500");
  });
});

describe("missingScopeMessage", () => {
  test("names sales-email-read for emails and points at private-app scopes", () => {
    const msg = missingScopeMessage("emails");
    expect(msg).toContain("sales-email-read");
    expect(msg).toContain("Private Apps");
    expect(msg).toContain("run a full sync again");
  });

  test("other subtypes get the generic private-app scope instruction", () => {
    const msg = missingScopeMessage("calls");
    expect(msg).not.toContain("sales-email-read");
    expect(msg).toContain("Private Apps");
  });
});
