import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Quality Floor, stage Q1 — the resilience primitives (F1: zero loading/
// error/not-found files anywhere, the audit's costliest finding). House
// structural pins: the three files exist and inherit app-wide, the skeleton
// is page-shaped with the 150ms grace (decision 2), the error boundary
// reports before it renders (failure mode 2), and the catch-all routes dead
// URLs into the chromed 404.

const app = join(__dirname, "..", "app");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("Q1: the resilience layer exists (DoD 1-2)", () => {
  test("the three primitives + the catch-all are on disk at the admin segment", () => {
    for (const p of [
      ["admin", "loading.tsx"],
      ["admin", "error.tsx"],
      ["admin", "not-found.tsx"],
      ["admin", "[...not_found]", "page.tsx"],
      ["admin", "_components", "PageSkeleton.tsx"],
    ]) {
      expect(existsSync(join(app, ...p)), p.join("/")).toBe(true);
    }
  });

  test("the skeleton is page-shaped, never a spinner, and carries the 150ms grace", () => {
    const s = src("admin", "_components", "PageSkeleton.tsx");
    expect(s).toMatch(/qf-skeleton/); // the grace class
    expect(s).toMatch(/animate-pulse/);
    expect(s).not.toMatch(/animate-spin/);
    // Page-shaped: the PageHeader and StatCard silhouettes, in house tokens.
    expect(s).toMatch(/mb-6/);
    expect(s).toMatch(/rounded-card-lg p-5/);
    const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
    expect(css).toMatch(/\.qf-skeleton\s*\{[\s\S]*?0\.15s/); // decision 2: 150ms delay
  });

  test("the admin loading.tsx renders the skeleton; heavy modules override with stat bands", () => {
    expect(src("admin", "loading.tsx")).toMatch(/<PageSkeleton \/>/);
    for (const mod of ["finance", "fundraising", "programs"]) {
      expect(src("admin", mod, "loading.tsx"), mod).toMatch(/<PageSkeleton stats=\{\d+\} rows=\{\d+\} \/>/);
    }
  });

  test("error.tsx: client boundary, reports BEFORE it renders, retry + way home, in-shell", () => {
    const s = src("admin", "error.tsx");
    expect(s).toMatch(/^"use client";/);
    // Failure mode 2: the boundary must not swallow observability — the
    // digest joins this log line to the server-side stack Next captured.
    expect(s).toMatch(/console\.error\(\s*`\[admin-error\] route=\$\{pathname\} digest=\$\{error\.digest/);
    expect(s).toMatch(/onClick=\{\(\) => reset\(\)\}/);
    expect(s).toMatch(/href="\/admin\/today"/);
    expect(s).not.toMatch(/alert\(/);
  });

  test("dead URLs land in the chromed 404 — the catch-all only ever calls notFound()", () => {
    const catchAll = src("admin", "[...not_found]", "page.tsx");
    expect(catchAll).toMatch(/notFound\(\);/);
    expect(catchAll).not.toMatch(/supabase|fetch\(/i); // routes, never reads
    const nf = src("admin", "not-found.tsx");
    expect(nf).toMatch(/href="\/admin\/today"/);
  });
});
