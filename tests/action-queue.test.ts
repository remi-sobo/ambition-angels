import { beforeEach, describe, expect, test, vi } from "vitest";

// React's RSC-only `cache` may not exist in the test environment; actionQueue
// calls it at module scope. Identity shim (the reed-spine-tools precedent).
vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: (mod as { cache?: unknown }).cache ?? (<T,>(fn: T) => fn) };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ getOrgContext: vi.fn() }));
vi.mock("@/lib/admin/entities", () => ({ resolveEntities: vi.fn(async () => []) }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getActionQueue } from "@/lib/admin/actionQueue";
import { mockSupabase, type QueuedResult } from "./support/supabaseMock";

// The queue's consolidation contract (Shannon's "tasks live in one place"):
// no fundraising group, and a gift whose thank-you already exists as an open
// ack-bridge ops_task (lib/fundraising/ack-tasks.ts) appears ONCE — as that
// task — never also as the view's acknowledgment row.

const row = (over: Record<string, unknown>) => ({
  org_id: "org-1",
  entity_type: null,
  entity_id: null,
  entity_label: null,
  owner_ref: null,
  owner_id: null,
  priority: "medium",
  status: "open",
  ...over,
});

const ROWS = [
  // The ack-bridge task mirroring gift-1 (labels live in ops_tasks, not the view).
  row({ source: "ops_task", source_id: "task-ack", title: "Thank Dana Fox for the $500 gift", due_date: "2026-07-01", module: "ops" }),
  // The same gift's acknowledgment arm row — the duplicate to drop.
  row({ source: "acknowledgment", source_id: "gift-1", title: "Thank-you due", due_date: "2026-06-26", priority: "high", status: "pending", module: "fundraising" }),
  // A pending gift with no task (e.g. bulk import) — kept, folded into ops.
  row({ source: "acknowledgment", source_id: "gift-2", title: "Thank-you due", due_date: "2026-07-02", priority: "high", status: "pending", module: "fundraising" }),
  // A grant requirement — folded into ops, not thank-you work.
  row({ source: "grant_requirement", source_id: "req-1", title: "Report due", due_date: "2026-08-01", priority: "high", status: "upcoming", module: "fundraising" }),
  // A major-gift escalation task: independent work, never deduped or flagged.
  row({ source: "ops_task", source_id: "task-esc", title: "Personally thank Dana Fox for their $5,000 major gift", due_date: "2026-07-03", module: "ops" }),
  // An ordinary ops task and a finance row: untouched by the fold.
  row({ source: "ops_task", source_id: "task-plain", title: "Order supplies", due_date: null, module: "ops" }),
  row({ source: "reconciliation_item", source_id: "rec-1", title: "Stripe payout", due_date: null, module: "finance" }),
];

const ACK_TASKS = [
  { id: "task-ack", labels: ["sys:ack", "sys:gift:gift-1"] },
  { id: "task-esc", labels: ["sys:ack", "sys:escalate:gift-1"] },
];

// Results dequeue in Promise.all order: view rows, entitlements, ack tasks.
function arrange(results: QueuedResult[]) {
  const { client } = mockSupabase(results);
  vi.mocked(createServerSupabase).mockReturnValue(client as unknown as SupabaseClient);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOrgContext).mockResolvedValue({ orgId: "org-1", userId: "u1" } as never);
});

describe("getActionQueue consolidation", () => {
  test("drops the acknowledgment row of a tasked gift and folds fundraising into ops", async () => {
    arrange([{ data: ROWS }, { data: [] }, { data: ACK_TASKS }]);
    const items = await getActionQueue();

    // The tasked gift appears exactly once — as its task, not the ack row.
    expect(items.find((it) => it.sourceId === "gift-1")).toBeUndefined();
    const mirror = items.find((it) => it.sourceId === "task-ack");
    expect(mirror).toBeDefined();
    expect(mirror!.ack).toBe(true);

    // No fundraising group anywhere; the survivors ride ops.
    expect(items.every((it) => it.module !== "fundraising")).toBe(true);
    expect(items.find((it) => it.sourceId === "gift-2")!.module).toBe("ops");
    expect(items.find((it) => it.sourceId === "req-1")!.module).toBe("ops");

    // Non-fundraising modules are untouched.
    expect(items.find((it) => it.sourceId === "rec-1")!.module).toBe("finance");

    // ack marks thank-you work only: the untasked gift and the mirror task,
    // not grants, escalations, or plain tasks.
    const acks = items.filter((it) => it.ack).map((it) => it.sourceId).sort();
    expect(acks).toEqual(["gift-2", "task-ack"]);

    // One row per unit of work.
    const ids = items.map((it) => `${it.source}:${it.sourceId}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(items).toHaveLength(ROWS.length - 1);
  });

  test("entitlement gate still keys on the row's real module", async () => {
    arrange([
      { data: ROWS },
      { data: [{ feature_key: "fundraising", enabled: false }] },
      { data: ACK_TASKS },
    ]);
    const items = await getActionQueue();
    // Fundraising-module rows are gated out even though survivors would fold to ops.
    expect(items.find((it) => it.sourceId === "gift-2")).toBeUndefined();
    expect(items.find((it) => it.sourceId === "req-1")).toBeUndefined();
    // Ops-module rows (including the ack mirror task) are unaffected.
    expect(items.find((it) => it.sourceId === "task-ack")).toBeDefined();
  });
});
