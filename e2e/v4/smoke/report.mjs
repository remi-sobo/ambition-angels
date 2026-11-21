#!/usr/bin/env node
// Summaries of the Stage P runs, from e2e/v4/.logs:
//   node e2e/v4/smoke/report.mjs roles   → .logs/roles-table.md
//   node e2e/v4/smoke/report.mjs a11y    → .logs/a11y-summary.md
//   node e2e/v4/smoke/report.mjs smoke   → .logs/smoke-summary.md
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOGS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.logs");
const read = (f) => (fs.existsSync(path.join(LOGS, f)) ? JSON.parse(fs.readFileSync(path.join(LOGS, f), "utf8")) : null);
const kind = process.argv[2] || "roles";

if (kind === "roles") {
  const cols = [];
  const by = new Map();
  for (const org of ["a", "b"]) {
    for (const role of ["owner", "staff", "finance", "board_viewer"]) {
      const rows = read(`roles-${org}-${role}.json`);
      if (!rows) continue;
      const col = `${org}:${role}`;
      cols.push(col);
      for (const r of rows) {
        const key = r.pattern === "(extra)" ? r.url.replace(/[0-9a-f-]{36}/, "[other org's id]") : r.pattern;
        if (!by.has(key)) by.set(key, {});
        const flags = [];
        if (r.leaks?.length) flags.push(`LEAK(${r.leaks.slice(0, 2).join(", ")})`);
        if (Array.isArray(r.writeControls) && r.writeControls.length && r.verdict === "ok") flags.push(`writes(${r.writeControls.slice(0, 3).join("; ")})`);
        by.get(key)[col] = `${r.verdict}${flags.length ? " " + flags.join(" ") : ""}`;
      }
    }
  }
  const short = { ok: "ok", "not-authorized": "denied", "module-off": "off", "not-found": "404" };
  const tally = {};
  const lines = [`# Two-org and role pass`, "", `Columns: org (a = Ambition Angels (demo), b = Lanternfield Youth Alliance (demo)) : role. denied = not-authorized panel, off = module not enabled, 404 = not-found inside the shell.`, ""];
  lines.push(`| Route | ${cols.join(" | ")} |`, `|---|${cols.map(() => "---").join("|")}|`);
  for (const [route, cells] of by) {
    lines.push(`| ${route} | ${cols.map((c) => { const v = cells[c] ?? ""; const s = v.split(" ")[0]; tally[s] = (tally[s] || 0) + 1; return (short[s] ?? s) + v.slice(s.length); }).join(" | ")} |`);
  }
  lines.splice(4, 0, `Totals: ${Object.entries(tally).map(([k, v]) => `${short[k] ?? k} ${v}`).join(", ")}.`, "");
  const problems = [...by].flatMap(([route, cells]) => Object.entries(cells).filter(([, v]) => /LEAK|writes\(|crash|nav-error|http-5/.test(v)).map(([c, v]) => `- ${route} (${c}): ${v}`));
  lines.push("", "## Problems", "", ...(problems.length ? problems : ["None."]));
  fs.writeFileSync(path.join(LOGS, "roles-table.md"), lines.join("\n") + "\n");
  console.log(lines.slice(0, 6).join("\n"));
  console.log(problems.length ? problems.join("\n") : "No leaks, crashes or board-viewer write controls.");
}

if (kind === "a11y") {
  const out = ["# Accessibility pass (axe-core, WCAG 2.2 AA tags, owner)", ""];
  for (const vp of ["desktop", "phone"]) {
    const rows = read(`a11y-${vp}.json`);
    if (!rows) continue;
    const rules = {};
    for (const r of rows) {
      const e = (rules[r.rule] ||= { impact: r.impact, help: r.help, routes: new Set(), nodes: 0 });
      e.routes.add(r.route);
      e.nodes += r.nodes || 0;
    }
    out.push(`## ${vp}`, "", "| Rule | Impact | Routes | Nodes | What |", "|---|---|---|---|---|");
    for (const [k, e] of Object.entries(rules).sort((a, b) => b[1].routes.size - a[1].routes.size)) out.push(`| ${k} | ${e.impact ?? ""} | ${e.routes.size} | ${e.nodes} | ${e.help ?? ""} |`);
    out.push("", "<details><summary>By route</summary>", "");
    const byRoute = {};
    for (const r of rows) (byRoute[r.route] ||= []).push(`${r.rule} (${r.nodes ?? 0}) ${r.target ?? ""}`);
    for (const [route, list] of Object.entries(byRoute)) out.push(`- ${route}: ${list.join("; ")}`);
    out.push("", "</details>", "");
  }
  fs.writeFileSync(path.join(LOGS, "a11y-summary.md"), out.join("\n") + "\n");
  console.log(out.filter((l) => l.startsWith("|") || l.startsWith("##")).join("\n"));
}

if (kind === "smoke") {
  const f = path.join(LOGS, "smoke-results.jsonl");
  const rows = fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const out = ["| Flow | Org | Role | Viewport | Measured | Target |", "|---|---|---|---|---|---|"];
  for (const r of rows) {
    const m = r.result ?? (r.clicksAfterOpen != null ? `${r.clicksAfterOpen} after opening` : r.clicksToBar != null ? `${r.clicksToBar} to the bar, ${r.clicksTotal} saved` : r.tapsToRoster != null ? `${r.tapsToRoster} to roster, ${r.tapsPerException}/exception` : r.clicks != null ? `${r.clicks}` : r.taps != null ? `${r.taps}, rollback ${r.rolledBack}` : "");
    out.push(`| ${r.flow} | ${r.org} | ${r.role} | ${r.vp} | ${m} | ${r.target ?? ""} |`);
  }
  fs.writeFileSync(path.join(LOGS, "smoke-summary.md"), out.join("\n") + "\n");
  console.log(out.join("\n"));
}
