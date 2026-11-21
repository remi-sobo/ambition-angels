import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";

// V4 §6 lint ratchet: raw <table>, hand-built overlays and unlabeled inputs
// under app/admin. Stage P (part 1) drove the allowlist to zero (spec §13,
// Stage G: "Lint rules at zero exceptions"), so this test now holds it there:
//  - the allowlist is empty for every rule;
//  - no file under app/admin offends (the kit's own Drawer, Modal, Stage and
//    DataTableFrame are the only exemptions, in eslint/admin-kit-rules.js);
//  - .eslintrc.js keeps every rule on as an error for app/admin.
// A new screen that needs a table, an overlay or a control uses the kit.

const require = createRequire(import.meta.url);
const { countOffenders, readAllowlist, total } = require("../eslint/admin-kit-counts.js") as {
  countOffenders: () => Promise<{ counts: Record<string, Record<string, number>>; files: number }>;
  readAllowlist: () => Record<string, Record<string, number>>;
  total: (m: Record<string, number>) => number;
};
const { RULES, KIT_FILES } = require("../eslint/admin-kit-rules.js") as {
  RULES: Record<string, { selector: string; message: string }>;
  KIT_FILES: Record<string, string[]>;
};

describe("admin kit lint ratchet", () => {
  test("the allowlist is empty for every rule", () => {
    const allow = readAllowlist();
    expect(Object.keys(allow).sort()).toEqual(Object.keys(RULES).sort());
    for (const rule of Object.keys(RULES)) expect(allow[rule], rule).toEqual({});
  });

  test("no file under app/admin offends any rule", async () => {
    const { counts, files } = await countOffenders();
    expect(files).toBeGreaterThan(400);
    for (const [rule, byFile] of Object.entries(counts)) {
      expect(byFile, `${rule}: use the kit instead`).toEqual({});
      expect(total(byFile)).toBe(0);
    }
  }, 120_000);

  test("the only exemptions are the kit primitives themselves", () => {
    expect(KIT_FILES).toEqual({
      "raw-table": ["app/admin/_components/ui/DataTableFrame.tsx"],
      overlay: ["app/admin/_components/ui/Drawer.tsx", "app/admin/_components/ui/Modal.tsx", "app/admin/_components/ui/Stage.tsx"],
      "unlabeled-input": [],
    });
  });

  test("every rule is an error across app/admin, with no per-file override but the kit's", () => {
    const config = require("../.eslintrc.js") as {
      overrides: { files: string[]; rules: Record<string, unknown> }[];
    };
    const [base, ...rest] = config.overrides;
    expect(base.files).toEqual(["app/admin/**/*.ts", "app/admin/**/*.tsx"]);
    const restricted = base.rules["no-restricted-syntax"] as [string, ...{ message: string }[]];
    expect(restricted[0]).toBe("error");
    expect(restricted.slice(1).map((r) => r.message).sort()).toEqual(Object.values(RULES).map((r) => r.message).sort());
    const kitGlobs = Object.values(KIT_FILES).flat().map((f) => f.replace(/[[\]()*?{}!+@]/g, "\\$&"));
    for (const o of rest) expect(kitGlobs).toEqual(expect.arrayContaining(o.files));
  });
});
