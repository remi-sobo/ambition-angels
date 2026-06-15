import { defineConfig, devices } from "@playwright/test";

/**
 * Visual-QA harness for the BloomOS admin (spec Phase 3 "Screenshot QA").
 *
 * The agent that builds these changes can't run a browser, and the admin pages
 * are auth-gated, so this is run by a human on a machine with a real session:
 *
 *   1. QA_BASE_URL=<preview-or-localhost> npx playwright test --grep @login
 *      → opens a browser, you log into /admin once; state is saved.
 *   2. QA_BASE_URL=<...> npm run qa:visual
 *      → captures full-page PNGs of every reviewed page into e2e/__screenshots__.
 *
 * Point it at the BEFORE deploy, save the PNGs, then the AFTER deploy, and diff.
 */
const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.output",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    storageState: process.env.QA_STORAGE_STATE ?? "e2e/.auth/state.json",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
