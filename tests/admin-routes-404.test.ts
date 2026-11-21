import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isKnownAdminPath, isUnknownAdminPath, __parseRoute } from "@/lib/admin/adminRoutes";
import { ADMIN_ROUTES } from "@/lib/admin/adminRoutes.generated";
import { scanAdminRoutes } from "../scripts/admin-routes.mjs";

const ROOT = join(__dirname, "..");

// V4 Stage G: unknown admin URLs answer a real 404, not a 200 with the 404
// screen (Phase 0 finding, specs/v4-phase0/00-harness-and-capture.md #4).
describe("admin 404: the route list matches the filesystem", () => {
  test("lib/admin/adminRoutes.generated.ts is current (run node scripts/admin-routes.mjs --write)", () => {
    expect([...ADMIN_ROUTES]).toEqual(scanAdminRoutes(ROOT));
  });

  test("every Work and Organization seat is known", () => {
    for (const p of [
      "/admin",
      "/admin/today",
      "/admin/work/tasks",
      "/admin/work/projects",
      "/admin/work/meetings",
      "/admin/work/documents",
      "/admin/work/my-week",
      "/admin/work/plan-close",
      "/admin/organization/board",
      "/admin/organization/compliance",
      "/admin/organization/strategy",
      "/admin/organization/team",
    ]) {
      expect(isKnownAdminPath(p), p).toBe(true);
    }
  });
});

describe("admin 404: matching", () => {
  test("dynamic segments take any one value, never zero or two", () => {
    expect(isKnownAdminPath("/admin/work/projects/abc")).toBe(true);
    expect(isKnownAdminPath("/admin/work/projects/abc/")).toBe(true);
    expect(isKnownAdminPath("/admin/work/projects/abc/extra")).toBe(false);
  });

  test("catch-all and optional catch-all patterns", () => {
    const routes = ["/admin/a/[...rest]", "/admin/b/[[...rest]]"].map(__parseRoute);
    expect(isKnownAdminPath("/admin/a", routes)).toBe(false);
    expect(isKnownAdminPath("/admin/a/x/y", routes)).toBe(true);
    expect(isKnownAdminPath("/admin/b", routes)).toBe(true);
    expect(isKnownAdminPath("/admin/b/x", routes)).toBe(true);
  });

  test("unknown addresses are 404s; assets and non-admin paths are left alone", () => {
    expect(isUnknownAdminPath("/admin/this-page-does-not-exist")).toBe(true);
    expect(isUnknownAdminPath("/admin/work/nope")).toBe(true);
    expect(isUnknownAdminPath("/admin/x/y/z")).toBe(true);
    expect(isUnknownAdminPath("/admin/work/tasks")).toBe(false);
    expect(isUnknownAdminPath("/admin/icon-192.png")).toBe(false);
    expect(isUnknownAdminPath("/admin/manifest.webmanifest")).toBe(false);
    expect(isUnknownAdminPath("/board/x")).toBe(false);
    expect(isUnknownAdminPath("/admin/%E0%A4%A")).toBe(true);
  });
});

describe("admin 404: the middleware answers with status 404 into the shell", () => {
  const src = readFileSync(join(ROOT, "middleware.ts"), "utf8");
  test("rewrites unknown admin paths to the catch-all with status 404, after the auth gate", () => {
    const gate = src.indexOf('return NextResponse.redirect(new URL("/admin", req.url));');
    const check = src.indexOf("isUnknownAdminPath(pathname)");
    expect(gate).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(gate);
    expect(src).toMatch(/NextResponse\.rewrite\(new URL\("\/admin\/__not_found", req\.url\), \{\s*status: 404/);
  });
  test("the catch-all still renders the in-shell not-found page", () => {
    expect(readFileSync(join(ROOT, "app/admin/[...not_found]/page.tsx"), "utf8")).toMatch(/notFound\(\);/);
  });
});
