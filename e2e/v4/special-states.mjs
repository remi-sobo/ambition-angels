#!/usr/bin/env node
// Special UI states for the V4 audit: overlays, loading, failed save, failed
// reads. Uses the same recorder as capture.mjs and writes manifest.json.
//   node e2e/v4/special-states.mjs --run special [--out dir]
// Toggles the mock through /__mock/config and always resets it at the end.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, newContext, shoot, mockConfig } from "./capture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const RUN = arg("run", "special");
const OUT = path.join(arg("out", process.env.V4_SHOTS || path.join(here, "out")), RUN);
fs.mkdirSync(OUT, { recursive: true });

// tables the shell needs to stay signed in; everything else can fail
const AUTH_TABLES = "memberships|orgs|profiles|org_entitlements|role_permissions|entity_types|org_terminology";

const STATES = [
  { name: "mobile-more-sheet", vp: "phone", path: "/admin/today", viewportOnly: true, before: async (p) => p.getByRole("button", { name: "More destinations" }).first().click() },
  { name: "mobile-quick-actions", vp: "phone", path: "/admin/today", viewportOnly: true, before: async (p) => p.getByRole("button", { name: "Quick actions" }).first().click() },
  { name: "quick-add-open", vp: "desktop", path: "/admin/today", viewportOnly: true, before: async (p) => p.getByRole("button", { name: "Quick add" }).first().click() },
  {
    name: "global-search-query", vp: "desktop", path: "/admin/today", viewportOnly: true, settleMs: 2500,
    before: async (p) => {
      await p.getByRole("button", { name: /Search/ }).first().click().catch(async () => p.keyboard.press("Control+k"));
      await p.getByPlaceholder("Search people, deals, tasks, pages…").fill("Harbor");
    },
  },
  {
    name: "global-search-query-phone", vp: "phone", path: "/admin/today", viewportOnly: true, settleMs: 2500,
    before: async (p) => {
      await p.keyboard.press("Control+k");
      const box = p.getByPlaceholder("Search people, deals, tasks, pages…");
      if (!(await box.isVisible().catch(() => false))) await p.getByRole("button", { name: /Search/ }).first().click();
      await box.fill("Harbor");
    },
  },
  { name: "reed-panel-open", vp: "desktop", path: "/admin/fundraising/donors-funders", viewportOnly: true, settleMs: 2000, before: async (p) => p.getByRole("button", { name: "Open Reed" }).first().click() },
  {
    name: "task-modal-open", vp: "desktop", path: "/admin/work/tasks", viewportOnly: true, settleMs: 1500,
    before: async (p) => p.getByText("Upload signed MOUs", { exact: false }).first().click(),
  },
  {
    name: "loading-skeleton-fundraising", vp: "desktop", path: "/admin/fundraising/today", viewportOnly: true, loading: true,
    mock: { delayMs: 12000, delayPattern: `(?!(${AUTH_TABLES})$).*` },
  },
  {
    name: "loading-skeleton-today-phone", vp: "phone", path: "/admin/today", viewportOnly: true, loading: true,
    mock: { delayMs: 12000, delayPattern: `(?!(${AUTH_TABLES})$).*` },
  },
  {
    name: "failed-save-toast", vp: "desktop", path: "/admin/work/tasks", viewportOnly: true, settleMs: 2500,
    mock: { failWrite: "ops_tasks|ops_task_events|audit_log" },
    before: async (p) => p.getByRole("button", { name: "Mark as done" }).first().click(),
  },
  { name: "reads-500-fundraising-today", vp: "desktop", path: "/admin/fundraising/today", mock: { failRead: `(?!(${AUTH_TABLES})$).*` } },
  { name: "reads-500-today", vp: "desktop", path: "/admin/today", mock: { failRead: `(?!(${AUTH_TABLES})$).*` } },
  { name: "reads-500-donor-360", vp: "desktop", path: null, detail: "constituent", mock: { failRead: `(?!(${AUTH_TABLES})$).*` } },
];

const RESET = { delayMs: 0, delayPattern: null, failWrite: null, failRead: null };

async function main() {
  const { buildRoutes } = await import("./routes.mjs");
  const { ids } = buildRoutes();
  const browser = await launch();
  const ctx = { desktop: await newContext(browser, "desktop"), phone: await newContext(browser, "phone") };
  const manifest = { run: RUN, startedAt: new Date().toISOString(), mock: await mockConfig(), shots: [] };
  let i = 0;
  for (const s of STATES) {
    const route = { label: s.name, group: "special", path: s.path || `/admin/fundraising/donors-funders/${ids[s.detail]}` };
    await mockConfig({ ...RESET, ...(s.mock || {}) });
    let rec;
    try {
      if (s.loading) {
        // Load a fast page first, then client-navigate so the route's
        // loading.tsx skeleton shows while the (delayed) RSC payload streams.
        const page = await ctx[s.vp].newPage();
        await mockConfig(RESET);
        await page.goto(`http://localhost:3000/admin/settings`, { waitUntil: "load", timeout: 120000 });
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await mockConfig({ ...RESET, ...s.mock });
        const t0 = Date.now();
        const link = page.locator(`a[href="${route.path}"]:visible`).first();
        await link.click({ timeout: 10000 });
        await page.waitForTimeout(2500);
        const file = `${String(i).padStart(3, "0")}_${s.name}_${s.vp}.jpg`;
        await page.screenshot({ path: path.join(OUT, file), type: "jpeg", quality: 70, timeout: 20000 });
        const txt = await page.evaluate(() => document.querySelector("main")?.innerText?.slice(0, 300) || "").catch(() => "");
        rec = { label: s.name, group: "special", route: route.path, viewport: s.vp, file, loadMs: Date.now() - t0, note: "client navigation from /admin/settings, captured 2.5s into a 12s mock delay on data tables", textSample: txt, verdict: "ok", consoleErrors: [], pageErrors: [], failedRequests: [] };
        await mockConfig(RESET);
        await page.waitForTimeout(10000);
        await page.close();
      } else {
        rec = await shoot(ctx[s.vp], route, s.vp, { index: i, name: s.name, before: s.before, viewportOnly: s.viewportOnly, settleMs: s.settleMs });
      }
    } catch (e) {
      rec = { label: s.name, route: route.path, viewport: s.vp, error: String(e.message).slice(0, 300) };
    }
    rec.mockState = s.mock || null;
    manifest.shots.push(rec);
    console.log(`[special] ${s.name} ${rec.verdict ?? "error"} ${rec.actionError ?? rec.error ?? ""}`);
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
    i++;
  }
  await mockConfig(RESET);
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
  await browser.close();
}

main().catch(async (e) => {
  console.error(e);
  await mockConfig(RESET).catch(() => {});
  process.exit(1);
});
