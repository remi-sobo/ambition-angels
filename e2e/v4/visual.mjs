#!/usr/bin/env node
// V4 Stage P: the visual regression run. Screenshots every nav destination
// (plus Settings and the 404) for four roles, empty and populated, at desktop
// 1440 and phone 390, then compares each first screen against a small
// committed baseline (e2e/v4/baseline/, 200px-wide JPEG thumbnails, no data
// beyond what the fixtures invent).
//
//   node e2e/v4/visual.mjs [--out dir] [--roles owner,staff] [--profiles populated] [--viewports desktop,phone] [--only substr]
//   node e2e/v4/visual.mjs --update     # rewrite the baseline from this run
//
// Needs the mock and the app up (npm run e2e:visual starts both). Writes
// <out>/<role>-<profile>/*.jpg (full size, for review), <out>/diff.json and
// <out>/diff.md. Exit code 1 when any shot differs beyond the threshold or
// has no baseline, so CI can gate on it; explain or --update, never ignore.
//
// The diff: both images are scaled to 200px wide in the browser (canvas), and
// a pixel "differs" when its grey level moves by more than 40 of 255. A shot
// fails when more than 1.5% of pixels differ, or its height changed by more
// than 10%. Dates in the fixtures are relative to today, so the same day's
// runs compare cleanly; text like "Good morning" can move a few pixels.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, newContext, mockConfig } from "./capture.mjs";
import { buildRoutes } from "./routes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const has = (k) => argv.includes(`--${k}`);
const BASE = process.env.V4_BASE || "http://localhost:3000";
const OUT = arg("out", process.env.V4_SHOTS ? path.join(process.env.V4_SHOTS, "visual") : path.join(here, "out/visual"));
const BASELINE = path.join(here, "baseline");
const ROLES = arg("roles", "owner,staff,finance,board_viewer").split(",");
const PROFILES = arg("profiles", "populated,empty").split(",");
const VIEWPORTS = arg("viewports", "desktop,phone").split(",");
const ONLY = arg("only", null);
const UPDATE = has("update");
const THUMB_W = 200;
const PIXEL_DELTA = 40;
const FAIL_RATIO = 0.015;

const slug = (s) => s.replace(/^\/admin\/?/, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 80) || "root";

function routeList() {
  const r = buildRoutes();
  const list = [...r.nav, { label: "Settings", path: "/admin/settings" }, { label: "404", path: "/admin/this-page-does-not-exist" }];
  const seen = new Set();
  return list.filter((x) => !seen.has(x.path) && seen.add(x.path) && (!ONLY || x.path.includes(ONLY)));
}

// Scale a JPEG/PNG buffer to THUMB_W in the browser; returns { jpg, grey, w, h }.
async function thumb(page, buf, mime) {
  return page.evaluate(
    async ({ b64, mime, W }) => {
      const img = new Image();
      img.src = `data:${mime};base64,${b64}`;
      await img.decode();
      const h = Math.max(1, Math.round((img.height * W) / img.width));
      const c = document.createElement("canvas");
      c.width = W;
      c.height = h;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, W, h);
      const d = g.getImageData(0, 0, W, h).data;
      const grey = [];
      for (let i = 0; i < d.length; i += 4) grey.push(Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]));
      return { jpg: c.toDataURL("image/jpeg", 0.6).split(",")[1], grey, w: W, h };
    },
    { b64: buf.toString("base64"), mime, W: THUMB_W },
  );
}

function compare(a, b) {
  if (Math.abs(a.h - b.h) / b.h > 0.1) return { ratio: 1, reason: `height ${b.h} → ${a.h}` };
  const h = Math.min(a.h, b.h);
  let n = 0;
  for (let i = 0; i < THUMB_W * h; i++) if (Math.abs(a.grey[i] - b.grey[i]) > PIXEL_DELTA) n++;
  const ratio = n / (THUMB_W * h);
  return { ratio, reason: ratio > FAIL_RATIO ? `${(ratio * 100).toFixed(1)}% of pixels changed` : "" };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  const scratch = await browser.newPage(); // the canvas used for thumbnails
  await scratch.setContent("<html><body></body></html>");
  const results = [];
  const routes = routeList();
  for (const profile of PROFILES) {
    for (const role of ROLES) {
      await mockConfig({ profile, role, org: "a", failRead: null, failWrite: null, delayMs: 0, reset: true });
      const run = `${role}-${profile}`;
      fs.mkdirSync(path.join(OUT, run), { recursive: true });
      fs.mkdirSync(path.join(BASELINE, run), { recursive: true });
      for (const vp of VIEWPORTS) {
        const ctx = await newContext(browser, vp);
        for (const route of routes) {
          const page = await ctx.newPage();
          const name = `${slug(route.path)}_${vp}`;
          const rec = { run, route: route.path, viewport: vp, file: `${run}/${name}.jpg` };
          try {
            await page.goto(BASE + route.path, { waitUntil: "load", timeout: 180000 });
            await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
            await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
            await page.waitForTimeout(500);
            const buf = await page.screenshot({ type: "jpeg", quality: 70, fullPage: false });
            fs.writeFileSync(path.join(OUT, rec.file), buf);
            const t = await thumb(scratch, buf, "image/jpeg");
            const basePng = path.join(BASELINE, run, `${name}.jpg`);
            if (UPDATE) {
              fs.writeFileSync(basePng, Buffer.from(t.jpg, "base64"));
              rec.status = "baseline-written";
            } else if (!fs.existsSync(basePng)) {
              rec.status = "no-baseline";
            } else {
              const b = await thumb(scratch, fs.readFileSync(basePng), "image/jpeg");
              const c = compare(t, b);
              rec.ratio = Number(c.ratio.toFixed(4));
              rec.status = c.reason ? "diff" : "same";
              if (c.reason) rec.reason = c.reason;
            }
          } catch (e) {
            rec.status = "error";
            rec.reason = String(e.message).slice(0, 200);
          }
          await page.close();
          results.push(rec);
          console.log(`[visual] ${rec.status.padEnd(16)} ${run} ${vp} ${route.path}${rec.reason ? "  " + rec.reason : ""}`);
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
  await mockConfig({ profile: "populated", role: "owner", reset: true });
  fs.writeFileSync(path.join(OUT, "diff.json"), JSON.stringify(results, null, 1));
  const bad = results.filter((r) => !["same", "baseline-written"].includes(r.status));
  const md = [
    `# Visual run ${new Date().toISOString()}`,
    "",
    `${results.length} shots, ${results.filter((r) => r.status === "same").length} same, ${bad.length} to explain.`,
    "",
    "| Run | Viewport | Route | Status | Why |",
    "|---|---|---|---|---|",
    ...bad.map((r) => `| ${r.run} | ${r.viewport} | ${r.route} | ${r.status} | ${r.reason ?? ""} |`),
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "diff.md"), md + "\n");
  console.log(`[visual] ${results.length} shots, ${bad.length} to explain → ${path.join(OUT, "diff.md")}`);
  process.exit(bad.length && !UPDATE ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
