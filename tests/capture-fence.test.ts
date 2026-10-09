import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Capture C2 step 9: the youth-data fence and the no-destination-writes rule,
// pinned as text over everything the parse stage ships. C2 must not be able
// to read a student row or write a destination row, and it never touches the
// service-role client (specs/bloomos-capture.md, Condition 2 and ruling 5).

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const ROOTS = [join(process.cwd(), "lib", "capture"), join(process.cwd(), "app", "api", "admin", "capture")];
const files = ROOTS.flatMap(walk);

const FORBIDDEN_TABLES = [
  "students",
  "applications",
  "cohort_members",
  "attendance",
  "imports",
  "interactions",
  "partner_interactions",
  "ops_tasks",
  "reed_drafts",
];

describe("capture fence (lib/capture/** and app/api/admin/capture/**)", () => {
  test("the stage ships files", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  for (const f of files) {
    const rel = f.slice(process.cwd().length + 1);
    const src = readFileSync(f, "utf8");

    test(`${rel}: never reads a youth table or writes a destination table`, () => {
      for (const t of FORBIDDEN_TABLES) {
        expect(src, `from("${t}")`).not.toMatch(new RegExp(`from\\(\\s*["'\`]${t}["'\`]\\s*\\)`));
      }
    });

    test(`${rel}: session client only, no auto-creating resolver, no student entity type`, () => {
      expect(src).not.toMatch(/getSupabaseAdmin/);
      expect(src).not.toMatch(/lib\/supabase\/admin/);
      expect(src).not.toMatch(/resolveConstituent/);
      expect(src).not.toMatch(/type:\s*["']student["']/);
      expect(src).not.toMatch(/\/api\/admin\/search\b/);
    });
  }

  test("the parse route stages cards and nothing else", () => {
    const route = readFileSync(join(process.cwd(), "app", "api", "admin", "capture", "route.ts"), "utf8");
    const written = Array.from(route.matchAll(/from\(["']([a-z_]+)["']\)\s*\n?\s*\.(insert|update|delete|upsert)/g)).map((m) => m[1]);
    expect(new Set(written)).toEqual(new Set(["captures", "capture_cards"]));
    expect(route).toMatch(/requireEntitlement\("ai\.capture"\)/);
    expect(route).toMatch(/createServerSupabase\(\)/);
  });
});
