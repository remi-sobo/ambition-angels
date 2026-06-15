import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Screenshot QA for the pages the Phase 1-3 visual work touches. Run by a human
 * with a real admin session (see playwright.config.ts header). Captures one
 * full-page PNG per route; run against BEFORE and AFTER deploys and diff.
 */

const SHOTS = "e2e/__screenshots__";

const PAGES: Array<{ name: string; path: string }> = [
  { name: "overview", path: "/admin" },
  { name: "kpis", path: "/admin/kpis" },
  { name: "compliance", path: "/admin/compliance" },
  { name: "major-gifts", path: "/admin/fundraising" },
  { name: "students", path: "/admin/students" },
  { name: "cohorts", path: "/admin/cohorts" },
  { name: "prospects", path: "/admin/fundraising/prospects" },
];

// Run once with `--grep @login` to create the saved session, then drop it.
test("@login save admin session", async ({ page }) => {
  await page.goto("/admin");
  // Manual login window: complete the email/password flow in the opened browser.
  await page.waitForURL(/\/admin(?!\/?$.*login)/, { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: "e2e/.auth/state.json" });
});

for (const { name, path } of PAGES) {
  test(`screenshot ${name}`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    const res = await page.goto(path, { waitUntil: "networkidle" });
    expect(res?.ok(), `${path} should load`).toBeTruthy();
    // Guard against silently landing on the login screen (no session).
    await expect(page.locator("text=Sign in").first()).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  });
}
