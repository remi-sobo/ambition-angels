#!/usr/bin/env node
// Contact sheets for quick review: tiles the top of each shot in a run
// (default 12 per sheet, 4 columns) with its label and verdict.
//   node e2e/v4/contact-sheet.mjs <runDir> [--viewport desktop] [--per 12] [--crop 900]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../package.json"));
const { chromium } = require("playwright-core");

const dir = path.resolve(process.argv[2]);
const opt = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const vp = opt("viewport", "desktop");
const per = Number(opt("per", 12));
const crop = Number(opt("crop", vp === "phone" ? 1688 : 900));
const cols = vp === "phone" ? 6 : 4;
const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const shots = m.shots.filter((s) => s.viewport === vp && s.file);
const outDir = path.join(dir, "sheets");
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server", "--no-sandbox", "--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const tileW = Math.floor(1600 / cols) - 8;
for (let i = 0; i < shots.length; i += per) {
  const batch = shots.slice(i, i + per);
  const html = `<html><body style="margin:0;background:#222;font:12px sans-serif;color:#fff;display:flex;flex-wrap:wrap;gap:8px;padding:4px">${batch
    .map((s) => {
      const src = "data:image/jpeg;base64," + fs.readFileSync(path.join(dir, s.file)).toString("base64");
      const bad = s.verdict !== "ok" || s.pageErrors.length;
      return `<div style="width:${tileW}px"><div style="padding:2px 4px;background:${bad ? "#a22" : "#333"}">${s.label} · ${s.verdict}</div><div style="height:${Math.round((tileW * crop) / (vp === "phone" ? 780 : 1440))}px;overflow:hidden;background:#fff"><img src="${src}" style="width:100%"></div></div>`;
    })
    .join("")}</body></html>`;
  const f = path.join(outDir, `tmp.html`);
  fs.writeFileSync(f, html);
  await page.goto("file://" + f);
  const out = path.join(outDir, `${vp}_${String(i / per + 1).padStart(2, "0")}.jpg`);
  await page.screenshot({ path: out, fullPage: true, type: "jpeg", quality: 75 });
  fs.rmSync(f);
  console.log(out);
}
await browser.close();
