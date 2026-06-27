import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Scope vitest to the unit tests under tests/ so it never tries to collect the
// Playwright visual-QA specs under e2e/ (which import @playwright/test).
export default defineConfig({
  resolve: {
    // Match the tsconfig "@/*" -> "./*" path alias so tests can import modules
    // the same way app code does.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
