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
  // tsconfig keeps jsx "preserve" for Next; tests that import a server
  // component (tests/role-guard-behavior.test.ts) need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
