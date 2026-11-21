#!/usr/bin/env node
/**
 * Counts the V4 admin lint offenders per rule and per file, with the same
 * selectors .eslintrc.js enforces (eslint/admin-kit-rules.js).
 *
 *   node eslint/admin-kit-counts.js           print totals and the top files
 *   node eslint/admin-kit-counts.js --write   rewrite eslint/admin-kit-allowlist.json
 *                                             (only to lower counts after a migration)
 *
 * tests/admin-lint-ratchet.test.ts calls countOffenders() and compares it to
 * the allowlist.
 */
const path = require("node:path");
const fs = require("node:fs");
const { ESLint } = require("eslint");
const { RULES, KIT_FILES, restrictedSyntax, ruleForMessage } = require("./admin-kit-rules");

const ROOT = path.join(__dirname, "..");
const ALLOWLIST = path.join(__dirname, "admin-kit-allowlist.json");

async function countOffenders() {
  const eslint = new ESLint({
    cwd: ROOT,
    useEslintrc: false,
    overrideConfig: {
      parser: require.resolve("@typescript-eslint/parser"),
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
      rules: { "no-restricted-syntax": restrictedSyntax(Object.keys(RULES)) },
    },
  });
  const results = await eslint.lintFiles(["app/admin/**/*.tsx", "app/admin/**/*.ts"]);
  const counts = Object.fromEntries(Object.keys(RULES).map((k) => [k, {}]));
  for (const r of results) {
    const rel = path.relative(ROOT, r.filePath).split(path.sep).join("/");
    for (const m of r.messages) {
      const rule = ruleForMessage(m.message);
      if (!rule || KIT_FILES[rule].includes(rel)) continue;
      counts[rule][rel] = (counts[rule][rel] ?? 0) + 1;
    }
  }
  for (const k of Object.keys(counts)) {
    counts[k] = Object.fromEntries(Object.entries(counts[k]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return { counts, files: results.length };
}

function readAllowlist() {
  return JSON.parse(fs.readFileSync(ALLOWLIST, "utf8"));
}

const total = (byFile) => Object.values(byFile).reduce((a, b) => a + b, 0);

module.exports = { countOffenders, readAllowlist, total, ALLOWLIST };

if (require.main === module) {
  countOffenders().then(({ counts, files }) => {
    console.log(`Scanned ${files} files under app/admin`);
    for (const [rule, byFile] of Object.entries(counts)) {
      const top = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 5);
      console.log(`${rule}: ${total(byFile)} in ${Object.keys(byFile).length} files`);
      for (const [f, n] of top) console.log(`    ${n}  ${f}`);
    }
    if (process.argv.includes("--write")) {
      fs.writeFileSync(ALLOWLIST, JSON.stringify(counts, null, 2) + "\n");
      console.log(`Wrote ${path.relative(ROOT, ALLOWLIST)}`);
    }
  });
}
