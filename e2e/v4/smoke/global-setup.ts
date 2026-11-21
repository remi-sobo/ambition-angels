import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/** Sign in once through the real login form; every test reuses the cookies.
 *  The mock decides who that session is (its org/role config), so tests
 *  switch org and role without signing in again. */
export default async function globalSetup(config: FullConfig) {
  const use = config.projects[0].use;
  const base = use.baseURL!;
  const state = path.resolve(__dirname, "../.logs/smoke-state.json");
  fs.mkdirSync(path.dirname(state), { recursive: true });
  const browser = await chromium.launch(use.launchOptions);
  const page = await browser.newPage();
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    await page.goto(`${base}/admin`, { waitUntil: "load", timeout: 300_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500 * (attempt + 1)); // let the form hydrate
    await page.getByPlaceholder("Email").fill("owner@demo.example");
    await page.getByPlaceholder("Password").fill("demo-password");
    const resp = page.waitForResponse((r) => r.url().includes("/api/admin/login"), { timeout: 60_000 }).catch(() => null);
    await page.locator('button[type="submit"]').click();
    const r = await resp;
    ok = !!r && r.ok();
  }
  if (!ok) throw new Error("smoke: could not sign in against the mock");
  await page.context().storageState({ path: state });
  await browser.close();
}
