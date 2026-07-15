import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Tenancy contract for the task-ingest core (core fence spec §6f, Phase A3):
// both callers — POST /api/ingest/tasks and the MCP connector — run on the
// service-role client, so the ops_tasks insert must carry org_id explicitly.
// Before this, the column default was the only org assignment, and the Phase C
// default drop would have turned every ingested task into a NOT NULL failure.

const AA_ORG = "17c75da8-082d-4c8f-b00b-a4100fb2eb22";

vi.mock("@/lib/admin/orgs", () => ({
  getResidentOrgId: vi.fn(async () => AA_ORG),
}));
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async () => {}),
}));

import { ingestTask } from "@/lib/admin/ops/ingest";

function fakeSupabase(
  existing: { id: string } | null,
  captured: { insert: Record<string, unknown> | null }
): SupabaseClient {
  const chain = {
    select: () => chain,
    contains: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: existing }),
    insert: (payload: Record<string, unknown>) => {
      captured.insert = payload;
      return {
        select: () => ({
          single: async () => ({
            data: { id: "11111111-1111-1111-1111-111111111111" },
            error: null,
          }),
        }),
      };
    },
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("ingestTask tenancy", () => {
  test("insert payload carries an explicit org_id (never the column default)", async () => {
    const captured = { insert: null as Record<string, unknown> | null };
    const r = await ingestTask(fakeSupabase(null, captured), null, { title: "Test task" });
    expect(r.status).toBe("created");
    expect(captured.insert?.org_id).toBe(AA_ORG);
  });

  test("dedupe skip path never inserts", async () => {
    const captured = { insert: null as Record<string, unknown> | null };
    const r = await ingestTask(fakeSupabase({ id: "existing-id" }, captured), null, {
      title: "Test task",
    });
    expect(r.status).toBe("skipped");
    expect(captured.insert).toBeNull();
  });
});

describe("ingestTask pinning", () => {
  // Auto-pinning every ingested task duplicated it on /admin/ops: once in the
  // priority-grouped list, once in the Today section (Shannon's bug report).
  test("tasks are NOT pinned for today by default", async () => {
    const captured = { insert: null as Record<string, unknown> | null };
    await ingestTask(fakeSupabase(null, captured), null, { title: "Test task" });
    expect(captured.insert?.pinned_for_today).toBe(false);
  });

  test("an explicit pin_today: true still pins", async () => {
    const captured = { insert: null as Record<string, unknown> | null };
    await ingestTask(fakeSupabase(null, captured), null, { title: "Test task", pin_today: true });
    expect(captured.insert?.pinned_for_today).toBe(true);
  });
});
