import { defineConfig } from "vitest/config";

// Scope vitest to the unit tests under tests/ so it never tries to collect the
// Playwright visual-QA specs under e2e/ (which import @playwright/test).
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
