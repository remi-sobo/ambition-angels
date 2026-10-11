import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Capture fence, split in C3 (specs/bloomos-capture.md, C3 step 1).
//
// 1. The parse path keeps the full C2 fence: no destination tables, no youth
//    tables, never the service-role client.
// 2. Each applier under lib/capture/apply/ may touch ONLY its own destination
//    table (plus capture_cards / captures). Still no youth tables, no
//    service-role client, no HubSpot push (ruling 9), no auto-creating
//    resolver, never a student entity.
// 3. The orchestration around the appliers (confirm, edit, the action routes)
//    reaches destinations only through lib/capture/apply, never by table name.

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p.slice(root.length + 1));
  }
  return out;
}

const YOUTH = ["students", "applications", "cohort_members", "cohort_sessions", "attendance", "imports"];
const DESTINATIONS = ["interactions", "partner_interactions", "ops_tasks", "reed_drafts"];

const fromCall = (t: string) => new RegExp(`from\\(\\s*["'\`]${t}["'\`]\\s*\\)`);
const tablesIn = (src: string) =>
  new Set(Array.from(src.matchAll(/from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)).map((m) => m[1]));

function commonFence(rel: string, src: string) {
  test(`${rel}: never a youth table`, () => {
    for (const t of YOUTH) expect(src, `from("${t}")`).not.toMatch(fromCall(t));
  });
  test(`${rel}: session client only, no resolver, no HubSpot push, no student entity`, () => {
    expect(src).not.toMatch(/getSupabaseAdmin/);
    expect(src).not.toMatch(/lib\/supabase\/admin/);
    expect(src).not.toMatch(/resolveConstituent/);
    expect(src).not.toMatch(/pushInteractionToHubSpot/);
    expect(src).not.toMatch(/type:\s*["']student["']/);
    expect(src).not.toMatch(/linked_entity_type:\s*["']student["']/);
    expect(src).not.toMatch(/\/api\/admin\/search\b/);
  });
}

const PARSE_PATH = [
  "lib/capture/spans.ts",
  "lib/capture/match.ts",
  "lib/capture/prompt.ts",
  "lib/capture/validate.ts",
  "lib/capture/context.ts",
  "lib/capture/staff.ts",
  "lib/capture/constants.ts",
  "lib/capture/types.ts",
  "app/api/admin/capture/route.ts",
  "app/api/admin/capture/[id]/route.ts",
];

const ORCHESTRATION = [
  "lib/capture/confirm.ts",
  "lib/capture/edit.ts",
  "lib/capture/deps.ts",
  "app/api/admin/capture/cards/[id]/route.ts",
  "app/api/admin/capture/[id]/confirm-all/route.ts",
  "app/api/admin/capture/candidates/route.ts",
];

// Per-file allowlist under lib/capture/apply/. A file not listed here fails.
const APPLY_ALLOWED: Record<string, string[]> = {
  "lib/capture/apply/interactions.ts": ["interactions"],
  "lib/capture/apply/partnerInteraction.ts": ["partner_interactions", "partners"],
  "lib/capture/apply/task.ts": ["ops_tasks"],
  "lib/capture/apply/draft.ts": ["reed_drafts"],
  "lib/capture/apply/shared.ts": [],
  "lib/capture/apply/index.ts": [],
};

describe("every capture file is covered by one fence", () => {
  test("no file under lib/capture or app/api/admin/capture escapes the lists", () => {
    const all = [...walk(join(root, "lib", "capture")), ...walk(join(root, "app", "api", "admin", "capture"))];
    const covered = new Set([...PARSE_PATH, ...ORCHESTRATION, ...Object.keys(APPLY_ALLOWED)]);
    expect(all.filter((f) => !covered.has(f))).toEqual([]);
  });
});

describe("parse path fence (C2, unchanged)", () => {
  for (const rel of PARSE_PATH) {
    const src = read(rel);
    commonFence(rel, src);
    test(`${rel}: never a destination table`, () => {
      for (const t of DESTINATIONS) expect(src, `from("${t}")`).not.toMatch(fromCall(t));
    });
  }

  test("the parse route stages cards and nothing else", () => {
    const route = read("app/api/admin/capture/route.ts");
    const written = Array.from(route.matchAll(/from\(["']([a-z_]+)["']\)\s*\n?\s*\.(insert|update|delete|upsert)/g)).map((m) => m[1]);
    expect(new Set(written)).toEqual(new Set(["captures", "capture_cards"]));
    expect(route).toMatch(/requireEntitlement\("ai\.capture"\)/);
    expect(route).toMatch(/createServerSupabase\(\)/);
  });
});

describe("applier fence (C3): each file touches only its own destination", () => {
  for (const [rel, allowed] of Object.entries(APPLY_ALLOWED)) {
    const src = read(rel);
    commonFence(rel, src);
    test(`${rel}: tables are ${allowed.join(", ") || "none"} (plus capture_cards / captures)`, () => {
      const ok = new Set([...allowed, "capture_cards", "captures"]);
      expect(Array.from(tablesIn(src)).filter((t) => !ok.has(t))).toEqual([]);
      for (const t of allowed) expect(src).toMatch(fromCall(t));
    });
  }

  test("the task applier never links a student", () => {
    const src = read("lib/capture/apply/task.ts");
    expect(src).toMatch(/card\.entity_type === "constituent" \|\| card\.entity_type === "partner"/);
  });
});

describe("orchestration fence (C3): destinations only through the appliers", () => {
  const VERIFY_READS = new Set(["constituents", "partners"]);
  for (const rel of ORCHESTRATION) {
    const src = read(rel);
    commonFence(rel, src);
    test(`${rel}: never a destination table by name`, () => {
      for (const t of DESTINATIONS) expect(src, `from("${t}")`).not.toMatch(fromCall(t));
    });
    test(`${rel}: writes only capture_cards / captures`, () => {
      const written = Array.from(src.matchAll(/from\(["']([a-z_]+)["']\)\s*\n?\s*\.(insert|update|delete|upsert)/g)).map((m) => m[1]);
      for (const t of written) expect(["capture_cards", "captures"]).toContain(t);
      for (const t of Array.from(tablesIn(src))) {
        expect(["capture_cards", "captures", ...Array.from(VERIFY_READS)]).toContain(t);
      }
    });
  }

  test("the action routes gate on ai.capture and use the session client", () => {
    for (const rel of ORCHESTRATION.filter((f) => f.startsWith("app/"))) {
      const src = read(rel);
      expect(src, rel).toMatch(/requireEntitlement\("ai\.capture"\)/);
      expect(src, rel).toMatch(/createServerSupabase\(\)|actionDeps\(/);
    }
    expect(read("lib/capture/deps.ts")).toMatch(/createServerSupabase\(\)/);
  });
});
