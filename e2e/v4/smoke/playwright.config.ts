import { defineConfig } from "@playwright/test";
import fs from "node:fs";

/**
 * V4 Stage P: smoke flows, two-org/role pass, accessibility pass and visual
 * run, all against the mock Supabase (e2e/v4/mock-supabase.mjs). Run through
 * `npm run e2e:smoke` (and friends), which start the mock and the app; see
 * e2e/v4/README.md. Serial on purpose: the mock holds one org/role at a time.
 */
const BASE = process.env.V4_BASE ?? "http://localhost:3032";
const chromium = process.env.V4_CHROMIUM ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: ".",
  outputDir: "../.logs/smoke-output",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: BASE,
    trace: "off",
    screenshot: "off",
    video: "off",
    storageState: "../.logs/smoke-state.json",
    navigationTimeout: 180_000,
    actionTimeout: 30_000,
    launchOptions: { executablePath: chromium, args: ["--no-proxy-server", "--no-sandbox"] },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    {
      name: "phone",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
    },
  ],
});
