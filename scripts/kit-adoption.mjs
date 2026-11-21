#!/usr/bin/env node
// Kit adoption count for BloomOS (V4 Stage A: "Kit adoption counted and
// published"). Scans app/admin source, outside the kit itself
// (app/admin/_components/ui), and writes specs/v4-phase0/kit-adoption.md.
//
//   node scripts/kit-adoption.mjs          print and write the report
//   node scripts/kit-adoption.mjs --print  print only
//
// Heuristic, source-level counts (regexes over the files, not a type-aware
// analysis). They are for trend, not audit: run it after each stage and
// compare. The lint numbers come from eslint/admin-kit-counts.js, the same
// selectors .eslintrc.js enforces.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = path.join(ROOT, "app/admin");
const KIT = path.join(ADMIN, "_components/ui");
const OUT = path.join(ROOT, "specs/v4-phase0/kit-adoption.md");

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const files = walk(ADMIN).filter((p) => !p.startsWith(KIT + path.sep));

// Named imports from the kit (the barrel or a file inside it).
function kitImports(src) {
  const names = new Set();
  // The spec part stops at quotes and semicolons, so one match never spans two
  // import statements. `_components/Button` is the kit Button's compat path.
  const re = /import\s+(?:type\s+)?([^;"']*?)\s+from\s+["']([^"']*_components\/(?:ui(?:\/[A-Za-z]+)?|Button))["']/g;
  for (const m of src.matchAll(re)) {
    const spec = m[1];
    const file = m[2].split("/").pop();
    const def = spec.match(/^([A-Za-z_$][\w$]*)/);
    if (def && !spec.startsWith("{")) names.add(file === "ui" ? def[1] : file);
    if (file === "Button" && /ButtonLink/.test(spec)) names.add("ButtonLink"); // default import = the file's component
    for (const n of spec.match(/\{([\s\S]*)\}/)?.[1].split(",") ?? []) {
      const name = n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
      if (name) names.add(name);
    }
  }
  return names;
}

const count = (src, re) => (src.match(re) ?? []).length;

const METRICS = {
  button: {
    label: "Button",
    kit: (n) => ["Button", "ButtonLink", "buttonClass"].some((k) => n.has(k)),
    // A hand-built primary: a button, a or Link whose class carries the solid accent fill.
    raw: (s) => count(s, /<(?:button|a|Link)\b[^>]*?className=(?:"[^"]*|\{`[^`]*|\{"[^"]*)\bbg-orange(?![\w/-])/g),
    rawLabel: "hand-built primary buttons",
  },
  field: {
    label: "Field",
    kit: (n) => ["TextField", "SelectField", "TextareaField", "DateField", "CheckboxField", "Input", "Select", "Textarea", "Field", "Checkbox"].some((k) => n.has(k)),
    raw: (s) => count(s, /<(?:input|select|textarea)\b(?![^>]*type=["']hidden["'])/g),
    rawLabel: "raw inputs, selects and textareas",
  },
  table: {
    label: "DataTable v2",
    kit: (n) => n.has("DataTable"),
    raw: (s) => count(s, /<table\b/g),
    rawLabel: "raw tables",
  },
  overlay: {
    label: "Drawer / Modal",
    kit: (n) => n.has("Drawer") || n.has("Modal"),
    raw: null, // from the lint count
    rawLabel: "hand-built overlays",
  },
};

const lint = require(path.join(ROOT, "eslint/admin-kit-counts.js"));
const { counts: lintCounts } = await lint.countOffenders();

const area = (p) => {
  const parts = rel(p).split("/");
  return parts[2]?.match(/\.(ts|tsx)$/) ? "(root)" : parts[2];
};

const rows = {};
const byArea = {};
let legacyDataTable = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const names = kitImports(src);
  if (/from\s+["'][^"']*_components\/DataTable["']/.test(src)) legacyDataTable++;
  const a = area(f);
  byArea[a] ??= { files: 0, kitButton: 0, rawPrimary: 0, kitField: 0, rawInputs: 0, kitTable: 0, rawTables: 0 };
  byArea[a].files++;
  for (const [key, m] of Object.entries(METRICS)) {
    rows[key] ??= { kitFiles: 0, rawFiles: 0, raw: 0 };
    const usesKit = m.kit(names);
    const raw = m.raw ? m.raw(src) : lintCounts.overlay[rel(f)] ?? 0;
    if (usesKit) rows[key].kitFiles++;
    if (raw > 0) rows[key].rawFiles++;
    rows[key].raw += raw;
    if (key === "button") (byArea[a].kitButton += usesKit ? 1 : 0), (byArea[a].rawPrimary += raw);
    if (key === "field") (byArea[a].kitField += usesKit ? 1 : 0), (byArea[a].rawInputs += raw);
    if (key === "table") (byArea[a].kitTable += usesKit ? 1 : 0), (byArea[a].rawTables += raw);
  }
}

const sum = (o) => Object.values(o).reduce((x, y) => x + y, 0);
const today = new Date().toISOString().slice(0, 10);
const lines = [];
lines.push("# BloomOS kit adoption");
lines.push("");
lines.push(`Generated ${today} by \`node scripts/kit-adoption.mjs\` over ${files.length} files in \`app/admin\` (the kit itself, \`app/admin/_components/ui\`, is not counted). Source-level regex counts: use them for trend between stages, not as an audit. Rerun after each stage and commit the result.`);
lines.push("");
lines.push("## Kit vs hand-built");
lines.push("");
lines.push("| Component | Files using the kit | Hand-built | Files with hand-built |");
lines.push("|---|---:|---|---:|");
for (const [key, m] of Object.entries(METRICS)) {
  const r = rows[key];
  lines.push(`| ${m.label} | ${r.kitFiles} | ${r.raw} ${m.rawLabel} | ${r.rawFiles} |`);
}
lines.push("");
lines.push(`The old client-only \`app/admin/_components/DataTable.tsx\` (localStorage saved views) is still imported by ${legacyDataTable} file(s).`);
lines.push("");
lines.push("## Lint ratchet (eslint/admin-kit-allowlist.json)");
lines.push("");
lines.push("New files may not add any of these; allowlisted files may only go down (`tests/admin-lint-ratchet.test.ts`).");
lines.push("");
lines.push("| Rule | Offences | Allowlisted files |");
lines.push("|---|---:|---:|");
for (const [rule, byFile] of Object.entries(lintCounts)) lines.push(`| ${rule} | ${sum(byFile)} | ${Object.keys(byFile).length} |`);
lines.push("");
lines.push("## By area");
lines.push("");
lines.push("| Area | Files | Kit Button files | Hand-built primaries | Kit Field files | Raw inputs | DataTable v2 files | Raw tables |");
lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
for (const [a, v] of Object.entries(byArea).sort(([x], [y]) => x.localeCompare(y))) {
  lines.push(`| ${a} | ${v.files} | ${v.kitButton} | ${v.rawPrimary} | ${v.kitField} | ${v.rawInputs} | ${v.kitTable} | ${v.rawTables} |`);
}
lines.push("");
lines.push("## How each number is counted");
lines.push("");
lines.push("- **Files using the kit:** a named or default import of the component from `app/admin/_components/ui` (the barrel or its file). Button counts `Button`, `ButtonLink` and `buttonClass`; Field counts the Field family and the bare `Input`/`Select`/`Textarea`/`Checkbox`.");
lines.push("- **Hand-built primary buttons:** a `<button>`, `<a>` or `<Link>` whose class string carries the solid `bg-orange` fill (tints like `bg-orange/10` are not counted).");
lines.push("- **Raw inputs:** every `<input>`, `<select>` and `<textarea>` outside the kit, except `type=\"hidden\"`.");
lines.push("- **Raw tables:** every `<table>` outside the kit.");
lines.push("- **Hand-built overlays and the lint rules:** the selectors in `eslint/admin-kit-rules.js`.");
lines.push("");

const md = lines.join("\n");
console.log(md);
if (!process.argv.includes("--print")) {
  fs.writeFileSync(OUT, md);
  console.error(`Wrote ${rel(OUT)}`);
}
