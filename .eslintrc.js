/* eslint-disable @typescript-eslint/no-require-imports */
// ESLint config (was .eslintrc.json). JS so the V4 admin kit rules can read
// their per-file allowlist: see eslint/admin-kit-rules.js.
const { RULES, KIT_FILES, restrictedSyntax } = require("./eslint/admin-kit-rules");
const allowlist = require("./eslint/admin-kit-allowlist.json");

const ALL = Object.keys(RULES);
// Override `files` are globs: escape the [id] / (group) segments of App Router paths.
const literal = (file) => file.replace(/[[\]()*?{}!+@]/g, "\\$&");

// file → the rules that file is excused from (allowlisted offender or kit primitive).
const excused = {};
for (const rule of ALL) {
  for (const file of [...Object.keys(allowlist[rule] ?? {}), ...KIT_FILES[rule]]) {
    (excused[file] ||= new Set()).add(rule);
  }
}

module.exports = {
  extends: ["next/core-web-vitals", "next/typescript"],
  overrides: [
    {
      files: ["app/admin/**/*.ts", "app/admin/**/*.tsx"],
      rules: {
        "no-alert": "error",
        "no-restricted-syntax": restrictedSyntax(ALL),
      },
    },
    // Today's offenders keep only the rules they don't break yet. The
    // counts inside them are held by tests/admin-lint-ratchet.test.ts.
    ...Object.entries(excused).map(([file, rules]) => {
      const keep = ALL.filter((r) => !rules.has(r));
      return { files: [literal(file)], rules: { "no-restricted-syntax": keep.length ? restrictedSyntax(keep) : "off" } };
    }),
  ],
};
