import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { mockSupabase } from "./support/supabaseMock";
import {
  COMPANY_STAGES,
  COMPANY_STAGE_LABELS,
  isCompanyStage,
  normalizeDomain,
  normalizeDomains,
} from "@/lib/fundraising/company-stages";
import { rollupCompanies } from "@/lib/fundraising/companies";

// Company profiles, Stage 1 (specs/bloomos-companies.md): the stage list, the
// domain rules, the list rollup, the PATCH route's validation, and the
// no-hardcoding fence from the brief.

let db = mockSupabase([]);
let pushed: string[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => db.client }));
vi.mock("@/lib/admin/auth", () => ({ isAuthed: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/hubspot/sync-out", () => ({
  pushConstituentToHubSpot: vi.fn(async (id: string) => {
    pushed.push(id);
  }),
}));

import { PATCH } from "@/app/api/admin/constituents/[id]/route";

const ID = "11111111-1111-1111-1111-111111111111";
const patch = (body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/admin/constituents/${ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    { params: { id: ID } },
  );

beforeEach(() => {
  pushed = [];
});

describe("company stages", () => {
  test("seven stages, in order, each with a label", () => {
    expect(COMPANY_STAGES).toEqual([
      "identified", "engaged", "qualified", "opportunity", "committed", "active_partner", "renewal",
    ]);
    expect(COMPANY_STAGES.map((s) => COMPANY_STAGE_LABELS[s])).toEqual([
      "Identified", "Engaged", "Qualified", "Opportunity", "Committed", "Active Partner", "Renewal",
    ]);
  });

  test("isCompanyStage accepts keys only", () => {
    expect(isCompanyStage("active_partner")).toBe(true);
    expect(isCompanyStage("Active Partner")).toBe(false);
    expect(isCompanyStage(null)).toBe(false);
  });

  test("the migration's check constraint lists the same seven keys", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/add_company_stage_to_constituents.sql"), "utf8");
    const m = sql.match(/company_stage in\s*\(([^)]*)\)/);
    expect(m).not.toBeNull();
    const keys = m![1].split(",").map((k) => k.trim().replace(/'/g, ""));
    expect(keys).toEqual([...COMPANY_STAGES]);
  });
});

describe("domains", () => {
  test("emails, URLs and casing all reduce to a bare domain", () => {
    expect(normalizeDomain("Example.COM")).toBe("example.com");
    expect(normalizeDomain("jo@example.com")).toBe("example.com");
    expect(normalizeDomain("https://www.example.com/about?x=1")).toBe("example.com");
    expect(normalizeDomain("mail.example.co.uk")).toBe("mail.example.co.uk");
  });

  test("things that are not domains are rejected", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("example")).toBeNull();
    expect(normalizeDomain("not a domain.com")).toBeNull();
  });

  test("lists dedupe and report the bad entries", () => {
    expect(normalizeDomains(["example.com", "EXAMPLE.com", " ", "nope"])).toEqual({
      domains: ["example.com"],
      invalid: ["nope"],
    });
  });
});

describe("rollupCompanies", () => {
  const companies = [
    { id: "a", org_name: "Beta Co", company_stage: "engaged", domains: ["beta.example"] },
    { id: "b", org_name: "Alpha Co", company_stage: "committed", domains: [] },
    { id: "c", org_name: "Not tracked", company_stage: null, domains: [] },
  ];

  test("totals gifts, counts only open asks and open opportunities, sorts by name", () => {
    const rows = rollupCompanies({
      companies,
      gifts: [
        { constituent_id: "a", amount: "100" },
        { constituent_id: "a", amount: 50 },
        { constituent_id: "c", amount: 999 },
      ],
      asks: [
        { funder_id: "a", amount_requested: 1000, status: "submitted" },
        { funder_id: "a", amount_requested: 5000, status: "awarded" },
      ],
      opportunities: [
        { constituent_id: "a", ask_amount: 2000, stage: "ask_made" },
        { constituent_id: "a", ask_amount: 7000, stage: "closed_won" },
      ],
      interactions: [
        { constituent_id: "a", occurred_at: "2026-10-01T10:00:00Z" },
        { constituent_id: "a", occurred_at: "2026-11-01T10:00:00Z" },
      ],
      tasks: [],
    });
    expect(rows.map((r) => r.name)).toEqual(["Alpha Co", "Beta Co"]);
    const beta = rows.find((r) => r.id === "a")!;
    expect(beta.given).toBe(150);
    expect(beta.openAskCount).toBe(2);
    expect(beta.openAskTotal).toBe(3000);
    expect(beta.lastActivity).toBe("2026-11-01T10:00:00Z");
  });

  test("next step is the earliest-due open task; undated tasks come last", () => {
    const rows = rollupCompanies({
      companies,
      gifts: [],
      asks: [],
      opportunities: [],
      interactions: [],
      tasks: [
        { linked_entity_id: "b", title: "Undated", due_date: null, status: "todo" },
        { linked_entity_id: "b", title: "Later", due_date: "2026-12-10", status: "todo" },
        { linked_entity_id: "b", title: "Sooner", due_date: "2026-12-01", status: "in_progress" },
        { linked_entity_id: "b", title: "Finished", due_date: "2026-11-01", status: "done" },
      ],
    });
    expect(rows.find((r) => r.id === "b")!.nextStep).toEqual({ title: "Sooner", due: "2026-12-01" });
  });
});

describe("PATCH /api/admin/constituents/[id]: company fields", () => {
  test("sets a stage on an organization and skips the HubSpot push", async () => {
    db = mockSupabase([{ data: { type: "organization" } }, { error: null }]);
    const res = await patch({ company_stage: "qualified" });
    expect(res.status).toBe(200);
    expect(db.calls.update[0]).toEqual({ company_stage: "qualified" });
    expect(pushed).toEqual([]);
  });

  test("refuses a stage on a person", async () => {
    db = mockSupabase([{ data: { type: "person" } }]);
    const res = await patch({ company_stage: "engaged" });
    expect(res.status).toBe(400);
    expect(db.calls.update).toEqual([]);
  });

  test("refuses an unknown stage before any read", async () => {
    db = mockSupabase([]);
    const res = await patch({ company_stage: "Active Partner" });
    expect(res.status).toBe(400);
    expect(db.calls.from).toEqual([]);
  });

  test("null stops tracking", async () => {
    db = mockSupabase([{ error: null }]);
    const res = await patch({ company_stage: null });
    expect(res.status).toBe(200);
    expect(db.calls.update[0]).toEqual({ company_stage: null });
  });

  test("domains are normalized, and a bad one fails the whole save", async () => {
    db = mockSupabase([{ error: null }]);
    expect((await patch({ domains: ["https://www.Example.com/x", "jo@example.com"] })).status).toBe(200);
    expect(db.calls.update[0]).toEqual({ domains: ["example.com"] });

    db = mockSupabase([]);
    const bad = await patch({ domains: ["example.com", "nope"] });
    expect(bad.status).toBe(400);
    expect(db.calls.update).toEqual([]);
  });

  test("other edits still push to HubSpot", async () => {
    db = mockSupabase([{ error: null }]);
    await patch({ org_name: "Renamed", domains: ["example.com"] });
    expect(pushed).toEqual([ID]);
  });
});

describe("nothing is hardcoded (brief: staff enter companies through the UI)", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(join(process.cwd(), "app/admin/fundraising/donors-funders/companies"));
  files.push(
    join(process.cwd(), "app/admin/fundraising/donors-funders/_components/CompanyPanel.tsx"),
    join(process.cwd(), "app/admin/fundraising/donors-funders/_components/CompanyControls.tsx"),
    join(process.cwd(), "lib/fundraising/companies.ts"),
    join(process.cwd(), "lib/fundraising/company-stages.ts"),
    join(process.cwd(), "supabase/migrations/add_company_stage_to_constituents.sql"),
  );

  test("no company name and no dollar figure in the Stage 1 files", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/twilio|monterra/i);
      expect(src, f).not.toMatch(/\$\s?\d/);
    }
  });
});
