import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";

// V4 §6 lint ratchet: raw <table>, hand-built overlays and unlabeled inputs
// under app/admin. .eslintrc.js errors on any NEW offending file; this test
// holds the allowlisted files to their counts, so the total only goes down:
//  - a file over its count fails;
//  - a file under its count fails too, until the allowlist is lowered
//    (run `node eslint/admin-kit-counts.js --write` after a migration).

const require = createRequire(import.meta.url);
const { countOffenders, readAllowlist, total } = require("../eslint/admin-kit-counts.js") as {
  countOffenders: () => Promise<{ counts: Record<string, Record<string, number>>; files: number }>;
  readAllowlist: () => Record<string, Record<string, number>>;
  total: (m: Record<string, number>) => number;
};

describe("admin kit lint ratchet", () => {
  test("counts match the allowlist exactly", async () => {
    const { counts, files } = await countOffenders();
    const allow = readAllowlist();
    expect(files).toBeGreaterThan(400);
    const summary = Object.fromEntries(
      Object.entries(counts).map(([rule, byFile]) => [rule, `${total(byFile)} in ${Object.keys(byFile).length} files`]),
    );
    console.log("admin kit lint counts:", summary);
    for (const rule of Object.keys(counts)) {
      const over: string[] = [];
      const under: string[] = [];
      const files = new Set([...Object.keys(counts[rule]), ...Object.keys(allow[rule] ?? {})]);
      for (const f of Array.from(files)) {
        const now = counts[rule][f] ?? 0;
        const allowed = allow[rule]?.[f] ?? 0;
        if (now > allowed) over.push(`${f}: ${now} (allowed ${allowed})`);
        if (now < allowed) under.push(`${f}: ${now} (allowlist says ${allowed}; lower it)`);
      }
      expect(over, `${rule}: new offenders, use the kit instead`).toEqual([]);
      expect(under, `${rule}: fixed, now ratchet the allowlist down`).toEqual([]);
    }
  }, 120_000);
});
