import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// React's RSC-only `cache` doesn't exist in the test environment; modules on
// the plan-metrics import path call it at module scope. Identity shim.
vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: (mod as { cache?: unknown }).cache ?? (<T,>(fn: T) => fn) };
});

// The canonical spine loaders are mocked whole: the contract under test is
// that Reed's tools hand their output through VERBATIM (no recompute, no
// re-rank — the "second opinions" failure mode in spec #6), and mocking the
// modules also keeps their server-only/cookie imports out of the test.
// finance.ts (on the plan-metrics import path) resolves its org via
// lib/admin/orgs.ts, which is server-only.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/statusLine", () => ({ getStatusLine: vi.fn() }));
vi.mock("@/lib/admin/outlookRead", () => ({ getOutlook: vi.fn() }));
vi.mock("@/lib/admin/actionQueue", () => ({ getActionQueue: vi.fn() }));
vi.mock("@/lib/admin/metrics/catalog", () => ({ getMetricCatalog: vi.fn() }));
vi.mock("@/lib/admin/profile", () => ({ getDisplayNames: vi.fn(async () => ({})) }));
vi.mock("@/lib/admin/permissions", () => ({ hasPermission: vi.fn(async () => true) }));

import { getStatusLine } from "@/lib/admin/statusLine";
import { getOutlook } from "@/lib/admin/outlookRead";
import { getActionQueue } from "@/lib/admin/actionQueue";
import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { getDisplayNames } from "@/lib/admin/profile";
import { hasPermission } from "@/lib/admin/permissions";
import { buildReedTools } from "@/lib/agents/reed/tools";
import {
  FINANCE_FORMULA_OVERLAY,
  METRIC_KEY_ALIASES,
  TOOL_FIELD_GLOSSARY,
} from "@/lib/agents/reed/metricGlossary";
import { PLAN_METRICS } from "@/lib/admin/plan/metrics";
import type { SupabaseClient } from "@supabase/supabase-js";

// Reed reads the spine (spec #6, Phase 1) — the wiring invariants.

const sb = {} as SupabaseClient;
const tool = (name: string) => {
  const t = buildReedTools(sb, "org-1", "remi@test").find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
};

const STATUS = {
  level: "watch" as const,
  line: "Watch: 4.2 months of runway, 2 overdue items.",
  runwayMonths: 4.2,
  overdueCount: 2,
  acksDue: 0,
  openCount: 12,
};
const OUTLOOK = { windows: [{ days: 30, level: "watch" }], overdueNow: 2 };

const QUEUE = [
  { source: "ops_task", sourceId: "t1", title: "Overdue thing", module: "ops", dueDate: "2000-01-02", priority: "high", status: "open", ownerRef: "remi", ownerId: "u1", entity: null, href: "/admin/ops" },
  { source: "grant_requirement", sourceId: "g1", title: "Report due", module: "fundraising", dueDate: "2999-01-01", priority: "medium", status: "upcoming", ownerRef: null, ownerId: null, entity: null, href: "/admin/fundraising/grants" },
  { source: "ops_task", sourceId: "t2", title: "Undated", module: "ops", dueDate: null, priority: "low", status: "open", ownerRef: null, ownerId: null, entity: null, href: "/admin/ops" },
];

const CATALOG = [
  {
    id: "m1", metric_key: "cash_runway_months", name: "Cash runway (months)",
    description: "Months of cash left at the current burn, from the canonical finance snapshot.",
    department: "finance", unit: "months", direction: "up" as const, cadence: "weekly",
    source_kind: "computed" as const, source_key: "cash_runway_months", target: 6, baseline: null,
    owner_id: "u1", active: true, latest: { value: 4.2, captured_on: "2026-07-10" }, stale: false, history: [],
  },
  {
    id: "m2", metric_key: "active_teens", name: "Active teens",
    description: "Teens active in the program this term.",
    department: "program", unit: "count", direction: "up" as const, cadence: "monthly",
    source_kind: "manual" as const, source_key: null, target: 500, baseline: null,
    owner_id: null, active: true, latest: { value: 350, captured_on: "2026-03-01" }, stale: true, history: [],
  },
  {
    id: "m3", metric_key: "retired_metric", name: "Retired",
    description: null, department: null, unit: null, direction: "up" as const, cadence: "monthly",
    source_kind: "manual" as const, source_key: null, target: null, baseline: null,
    owner_id: null, active: false, latest: null, stale: false, history: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasPermission).mockResolvedValue(true);
  vi.mocked(getStatusLine).mockResolvedValue(STATUS);
  vi.mocked(getOutlook).mockResolvedValue(OUTLOOK as never);
  vi.mocked(getActionQueue).mockResolvedValue(QUEUE as never);
  vi.mocked(getMetricCatalog).mockResolvedValue(CATALOG as never);
  vi.mocked(getDisplayNames).mockResolvedValue({ u1: "Remi Sobo" });
});

describe("get_status_and_outlook", () => {
  test("returns the loader output VERBATIM — same objects, no recompute", async () => {
    const out = (await tool("get_status_and_outlook").run({})) as { status: unknown; outlook: unknown };
    expect(out.status).toBe(STATUS);
    expect(out.outlook).toBe(OUTLOOK);
  });

  test("gates on finance.read before the loaders run (they reach the service-role snapshot)", async () => {
    vi.mocked(hasPermission).mockResolvedValue(false);
    const out = (await tool("get_status_and_outlook").run({})) as { error?: string };
    expect(out.error).toBe("permission_denied");
    expect(getStatusLine).not.toHaveBeenCalled();
    expect(getOutlook).not.toHaveBeenCalled();
  });
});

describe("get_needs_you_queue", () => {
  test("same items, same order, same count as the Command Center queue", async () => {
    const out = (await tool("get_needs_you_queue").run({})) as {
      total: number; overdueCount: number; items: unknown[];
    };
    expect(out.total).toBe(QUEUE.length);
    expect(out.items).toEqual(QUEUE); // verbatim rows, loader order
    expect(out.items[0]).toBe(QUEUE[0]); // top-of-list pin
    expect(out.overdueCount).toBe(1);
  });

  test("caps output and says so", async () => {
    const out = (await tool("get_needs_you_queue").run({ limit: 2 })) as {
      returned: number; items: unknown[]; note: string;
    };
    expect(out.returned).toBe(2);
    expect(out.items).toEqual(QUEUE.slice(0, 2));
    expect(out.note).toContain("top 2 of 3");
  });
});

describe("audit_metric_catalog", () => {
  test("flags stale and unowned metrics — unowned is a finding, not an omission", async () => {
    const out = (await tool("audit_metric_catalog").run({})) as {
      count: number; staleCount: number; unownedCount: number; inactiveCount: number;
      metrics: { metric_key: string; owner: string | null; unowned: boolean; stale: boolean; ageDays: number | null }[];
    };
    expect(out.count).toBe(2); // active only
    expect(out.inactiveCount).toBe(1);
    expect(out.staleCount).toBe(1);
    expect(out.unownedCount).toBe(1);
    const teens = out.metrics.find((m) => m.metric_key === "active_teens")!;
    expect(teens.stale).toBe(true);
    expect(teens.unowned).toBe(true);
    expect(teens.ageDays).toBeGreaterThan(0);
    const runway = out.metrics.find((m) => m.metric_key === "cash_runway_months")!;
    expect(runway.owner).toBe("Remi Sobo");
  });

  test("denies cleanly without metrics.read", async () => {
    vi.mocked(hasPermission).mockResolvedValue(false);
    const out = (await tool("audit_metric_catalog").run({})) as { error?: string };
    expect(out.error).toBe("permission_denied");
  });
});

describe("explain_metric (catalog-first)", () => {
  test("cash_runway_months: catalog definition AND locked formula, one answer", async () => {
    const out = (await tool("explain_metric").run({ metric_key: "cash_runway_months" })) as Record<string, unknown>;
    expect(out.source).toBe("catalog");
    expect(out.definition).toBe(CATALOG[0].description);
    expect(out.locked_formula).toBe(FINANCE_FORMULA_OVERLAY.cash_runway_months);
    expect(out.latest).toBe(CATALOG[0].latest);
  });

  test("catalog metric without overlay: catalog definition, null formula", async () => {
    const out = (await tool("explain_metric").run({ metric_key: "active_teens" })) as Record<string, unknown>;
    expect(out.source).toBe("catalog");
    expect(out.definition).toBe(CATALOG[1].description);
    expect(out.locked_formula).toBeNull();
  });

  test("pre-catalog alias 'runway' resolves to the catalog row", async () => {
    const out = (await tool("explain_metric").run({ metric_key: "runway" })) as Record<string, unknown>;
    expect(out.metric_key).toBe("cash_runway_months");
    expect(out.source).toBe("catalog");
  });

  test("tool-result fields (forecast) resolve to their locked glossary text", async () => {
    const out = (await tool("explain_metric").run({ metric_key: "forecast" })) as Record<string, unknown>;
    expect(out.source).toBe("tool_field");
    expect(out.definition).toBe(TOOL_FIELD_GLOSSARY.forecast);
  });

  test("unknown key: not_found pointing at the catalog, never a made-up definition", async () => {
    const out = (await tool("explain_metric").run({ metric_key: "vibes" })) as { error?: string };
    expect(out.error).toBe("not_found");
  });
});

describe("drift guards (spec #6 failure mode: explain_metric drift, round two)", () => {
  const backfillSql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "metrics_plan_kpis_backfill.sql"),
    "utf8",
  );

  test("every finance overlay key exists in the catalog seed vocabulary", () => {
    const seeded = new Set(Object.keys(PLAN_METRICS));
    for (const key of Object.keys(FINANCE_FORMULA_OVERLAY)) {
      const inSeed = seeded.has(key) || backfillSql.includes(`'${key}'`);
      expect(inSeed, `overlay key "${key}" is not a seeded catalog metric_key`).toBe(true);
    }
  });

  test("alias targets are overlay keys; tool-field keys never shadow overlay keys", () => {
    for (const target of Object.values(METRIC_KEY_ALIASES)) {
      expect(FINANCE_FORMULA_OVERLAY[target], `alias target "${target}" has no overlay`).toBeTruthy();
    }
    for (const key of Object.keys(TOOL_FIELD_GLOSSARY)) {
      expect(FINANCE_FORMULA_OVERLAY[key], `"${key}" is both tool-field and overlay`).toBeUndefined();
      expect((PLAN_METRICS as Record<string, unknown>)[key], `"${key}" graduated to the catalog — move it to the overlay`).toBeUndefined();
    }
  });
});

describe("loader side-effect guard", () => {
  test("getChangeSince (writes user_org_state) is never imported or called by Reed's tools", () => {
    // The name may appear in the module's warning comment — that note is the
    // guard rail. What must never appear is an import or a call.
    const src = readFileSync(join(process.cwd(), "lib", "agents", "reed", "tools.ts"), "utf8");
    expect(src).not.toMatch(/import\s*\{[^}]*getChangeSince[^}]*\}/);
    expect(src).not.toMatch(/getChangeSince\s*\(/);
  });

  test("the four spine tools are registered", () => {
    const names = buildReedTools(sb, "org-1", "remi@test").map((t) => t.name);
    for (const n of ["get_needs_you_queue", "get_status_and_outlook", "audit_metric_catalog", "explain_metric"]) {
      expect(names).toContain(n);
    }
  });
});
