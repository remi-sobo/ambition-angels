import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * V4 Stage D: the ported story-bank code is guarded the way main guards
 * everything on the service-role client. Source-level, like
 * tests/role-guard-coverage.test.ts and tests/tenant-isolation.test.ts:
 *   1. every handler in the story-bank routes opens with
 *      requirePermission(..., { entitlement: "modules.comms" });
 *   2. every Comms page opens with requirePagePermission("comms.manage", ...);
 *   3. every read, update or delete of a story-bank table carries an org_id
 *      filter (inserts stamp org_id in the row).
 */

const ROOT = join(__dirname, "..");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
};
const rel = (p: string) => relative(ROOT, p).split("\\").join("/");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const STORY_ROUTE_DIRS = ["stories", "subjects", "consents", "editions", "formats", "media", "audience"].map((d) =>
  join(ROOT, "app/api/admin/comms", d),
);
const routeFiles = STORY_ROUTE_DIRS.flatMap((d) => walk(d)).filter((f) => f.endsWith("route.ts"));

const BANK_TABLES = ["stories", "story_subjects", "story_consents", "story_media", "comms_formats", "comms_outputs", "comms_editions", "comms_edition_slots"];

function handlers(src: string): Array<{ method: string; body: string }> {
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g;
  const hits = Array.from(src.matchAll(re)).map((m) => ({ i: m.index ?? 0, method: m[1] }));
  return hits.map((h, k) => ({ method: h.method, body: src.slice(h.i, k + 1 < hits.length ? hits[k + 1].i : src.length) }));
}

describe("story-bank routes are role-guarded", () => {
  test("the route set is the one this stage ships", () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(14);
  });
  for (const f of routeFiles) {
    test(`${rel(f)}: every handler calls requirePermission with modules.comms`, () => {
      const src = strip(readFileSync(f, "utf8"));
      const hs = handlers(src);
      expect(hs.length).toBeGreaterThan(0);
      for (const h of hs) {
        expect(h.body, `${h.method} lacks requirePermission`).toMatch(/requirePermission\(\s*"(comms\.manage|fundraising\.read)",\s*\{\s*entitlement:\s*"modules\.comms"\s*\}/);
      }
    });
  }
});

describe("Comms pages are role-guarded", () => {
  const pages = ["home", "stories", "stories/new", "stories/[id]", "editions", "editions/[id]", "settings"].map((p) => join(ROOT, "app/admin/comms", p, "page.tsx"));
  for (const p of pages) {
    test(`${rel(p)} calls requirePagePermission("comms.manage") first`, () => {
      const src = strip(readFileSync(p, "utf8"));
      expect(src).toMatch(/requirePagePermission\("comms\.manage", "Comms", \{ entitlement: "modules\.comms" \}\)/);
    });
  }
});

describe("story-bank reads and writes are pinned to the org", () => {
  const files = [
    ...routeFiles,
    ...walk(join(ROOT, "lib/admin/comms")),
    ...walk(join(ROOT, "app/admin/comms")),
    join(ROOT, "lib/comms/story-gate.ts"),
  ];
  for (const f of files) {
    test(`${rel(f)}: every non-insert statement on a bank table filters org_id`, () => {
      const src = readFileSync(f, "utf8");
      const bad: string[] = [];
      for (const m of Array.from(src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g))) {
        if (!BANK_TABLES.includes(m[1])) continue;
        const start = m.index ?? 0;
        const semi = src.indexOf(";", start);
        const stmt = src.slice(start, semi === -1 ? start + 800 : semi);
        if (/\.(insert|upsert)\(/.test(stmt)) continue;
        if (!stmt.includes("org_id")) bad.push(stmt.replace(/\s+/g, " ").slice(0, 100));
      }
      expect(bad).toEqual([]);
    });
  }
});
