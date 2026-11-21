#!/usr/bin/env node
// BloomOS V4 audit capture: logs in through the real UI (against the mock) and
// screenshots a route list at desktop and/or phone size, recording per shot:
// route, final URL, HTTP status, redirect chain, console errors, page errors,
// failed requests (incl. 4xx/5xx API responses), error boundary / 404 /
// module-gate / permission text, h1, and load time. Writes manifest.json.
//
//   node e2e/v4/capture.mjs --run populated-owner --set all --viewports desktop,phone
//   node e2e/v4/capture.mjs --run empty-owner --set nav --profile empty
//   node e2e/v4/capture.mjs --run populated-staff --set nav --role staff --viewports desktop
//   node e2e/v4/capture.mjs --run special --set special
//
// Options: --out <dir> (default $V4_SHOTS or e2e/v4/out), --base http://localhost:3000,
//          --mock http://127.0.0.1:55321, --only <substring>, --limit N
// The mock's profile/role are switched via its /__mock/config endpoint.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildRoutes } from "./routes.mjs";
import { DEMO } from "./fixtures/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../package.json"));
const { chromium } = require("playwright-core");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "1"]);
    return acc;
  }, [])
);
const RUN = args.run || "adhoc";
const BASE = args.base || process.env.V4_BASE || "http://localhost:3000";
const MOCK = args.mock || process.env.V4_MOCK || "http://127.0.0.1:55321";
const OUT = path.join(args.out || process.env.V4_SHOTS || path.join(here, "out"), RUN);
const VIEWPORTS = (args.viewports || "desktop,phone").split(",");
const SET = args.set || "all";
fs.mkdirSync(OUT, { recursive: true });

const VP = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
};

export async function mockConfig(body) {
  const r = await fetch(`${MOCK}/__mock/config`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

const slugify = (s) => s.replace(/^\/admin\/?/, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 90) || "root";

export async function login(page) {
  // The form must hydrate first: clicking before React attaches submits it
  // natively (GET /admin?) and no /api/admin/login request is ever made.
  let r = null;
  for (let attempt = 0; attempt < 4 && !r; attempt++) {
    await page.goto(`${BASE}/admin`, { waitUntil: "load", timeout: 180000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500 * (attempt + 1));
    await page.getByPlaceholder("Email").fill(DEMO.user.email);
    await page.getByPlaceholder("Password").fill("demo-password");
    const resp = page.waitForResponse((x) => x.url().includes("/api/admin/login"), { timeout: 60000 }).catch(() => null);
    await page.locator('button[type="submit"]').click();
    r = await resp;
  }
  if (!r || !r.ok()) throw new Error(`login failed: ${r ? r.status() : "no /api/admin/login response"}`);
  await page.goto(`${BASE}/admin/today`, { waitUntil: "domcontentloaded", timeout: 180000 });
}

async function inspect(page) {
  return page.evaluate(() => {
    const txt = document.body?.innerText || "";
    const h1 = [...document.querySelectorAll("main h1, h1")].map((h) => h.innerText.trim()).filter(Boolean).slice(0, 3);
    return {
      h1,
      errorBoundary: /Something broke on this page/.test(txt),
      notFound: /There.s no page here|This page could not be found|404/.test(txt) && /no page here|could not be found/.test(txt),
      moduleGate: /This module isn.t enabled/.test(txt),
      permissionText: (txt.match(/[^\n]*(don.t have (access|permission)|not authori[sz]ed|Only (an )?(org )?owners?|requires? (the )?[a-z.]+ permission|You can.t view)[^\n]*/i) || [null])[0],
      loginScreen: !!document.querySelector('input[placeholder="Email"]') && /Sign in/.test(txt),
      nextErrorOverlay: !!document.querySelector("nextjs-portal") && /Unhandled Runtime Error|Server Error|Failed to compile/.test(document.querySelector("nextjs-portal")?.shadowRoot?.textContent || ""),
      overlayText: (document.querySelector("nextjs-portal")?.shadowRoot?.textContent || "").slice(0, 400),
      bodyChars: txt.length,
      // page wider than the viewport (phone: the browser zooms out to fit)
      overflowX: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) - window.screen.width,
      toast: document.body?.dataset.v4Toast || [...document.querySelectorAll('[role="status"]')].map((n) => n.innerText.trim()).filter(Boolean).join(" | ") || null,
      emptyHints: (txt.match(/(No [a-z ]+ yet|Nothing (here|to show)[^\n]*|no data)/gi) || []).slice(0, 5),
    };
  });
}

export async function shoot(context, route, vpName, extra = {}) {
  const page = await context.newPage();
  const rec = { label: route.label, group: route.group, route: route.path, viewport: vpName, consoleErrors: [], pageErrors: [], failedRequests: [], redirects: [] };
  page.on("console", (m) => m.type() === "error" && rec.consoleErrors.length < 15 && rec.consoleErrors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => rec.pageErrors.length < 10 && rec.pageErrors.push(String(e.message || e).slice(0, 300)));
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText || "";
    if (/ERR_ABORTED/.test(f) && /_rsc=|webpack-hmr|__nextjs/.test(r.url())) return;
    rec.failedRequests.length < 15 && rec.failedRequests.push(`${r.method()} ${r.url().replace(BASE, "")} ${f}`);
  });
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && (u.startsWith(BASE + "/api/") || u.startsWith(MOCK)) && rec.failedRequests.length < 15) rec.failedRequests.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, "").replace(MOCK, "mock:")}`.slice(0, 250));
  });
  const t0 = Date.now();
  let resp = null;
  try {
    resp = await page.goto(BASE + route.path, { waitUntil: "load", timeout: 180000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => (rec.networkIdleTimeout = true));
  } catch (e) {
    rec.navError = String(e.message).slice(0, 300);
  }
  rec.loadMs = Date.now() - t0;
  if (resp) {
    rec.status = resp.status();
    let req = resp.request().redirectedFrom();
    while (req) {
      rec.redirects.unshift(req.url().replace(BASE, ""));
      req = req.redirectedFrom();
    }
  }
  rec.finalUrl = page.url().replace(BASE, "");
  if (extra.before) {
    try {
      await extra.before(page);
    } catch (e) {
      rec.actionError = String(e.message).slice(0, 300);
    }
  }
  await page.waitForTimeout(extra.settleMs ?? 600);
  Object.assign(rec, await inspect(page).catch((e) => ({ inspectError: String(e) })));
  const file = `${String(extra.index ?? 0).padStart(3, "0")}_${slugify(extra.name || route.path)}_${vpName}.jpg`;
  try {
    await page.screenshot({ path: path.join(OUT, file), fullPage: !extra.viewportOnly, type: "jpeg", quality: 70, timeout: 60000 });
    rec.file = file;
  } catch (e) {
    rec.screenshotError = String(e.message).slice(0, 200);
  }
  rec.verdict = rec.navError ? "nav-error" : rec.errorBoundary ? "error-boundary" : rec.nextErrorOverlay ? "dev-overlay-error" : rec.notFound ? "not-found" : rec.loginScreen && !route.signedOut ? "bounced-to-login" : rec.moduleGate ? "module-gate" : rec.status >= 400 ? `http-${rec.status}` : "ok";
  await page.close();
  return rec;
}

export async function newContext(browser, vpName, { signedIn = true } = {}) {
  const context = await browser.newContext({ ...VP[vpName], ignoreHTTPSErrors: true });
  if (signedIn) {
    const p = await context.newPage();
    await login(p);
    await p.close();
  }
  return context;
}

export async function launch() {
  return chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server", "--no-sandbox"] });
}

function routeSet(set) {
  const r = buildRoutes();
  const dedupe = (arr) => arr.filter((x, i) => arr.findIndex((y) => y.path === x.path) === i);
  if (set === "nav") return dedupe([...r.nav, r.extras.find((e) => e.path === "/admin/settings")]);
  if (set === "details") return r.details;
  if (set === "orphans") return r.orphans;
  return dedupe(r.all);
}

async function main() {
  if (args.profile || args.role) console.log("mock config:", await mockConfig({ ...(args.profile ? { profile: args.profile } : {}), ...(args.role ? { role: args.role } : {}) }));
  const cfg = await mockConfig();
  let routes = routeSet(SET);
  if (args.only) routes = routes.filter((r) => r.path.includes(args.only) || r.label.includes(args.only));
  if (args.limit) routes = routes.slice(0, Number(args.limit));
  const browser = await launch();
  const manifest = { run: RUN, startedAt: new Date().toISOString(), base: BASE, mock: { profile: cfg.profile, role: cfg.role }, viewports: VIEWPORTS, shots: [] };
  const write = () => fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
  for (const vp of VIEWPORTS) {
    const ctxIn = await newContext(browser, vp);
    let ctxOut = null;
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      let ctx = ctxIn;
      if (route.signedOut) ctx = ctxOut ||= await newContext(browser, vp, { signedIn: false });
      const rec = await shoot(ctx, route, vp, { index: i });
      manifest.shots.push(rec);
      console.log(`[${RUN}] ${vp} ${String(i + 1).padStart(3)}/${routes.length} ${rec.verdict.padEnd(16)} ${rec.status ?? "-"} ${rec.loadMs}ms ${route.path}${rec.finalUrl !== route.path ? " -> " + rec.finalUrl : ""}`);
      write();
    }
    await ctxIn.close();
    if (ctxOut) await ctxOut.close();
  }
  manifest.finishedAt = new Date().toISOString();
  write();
  await browser.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
