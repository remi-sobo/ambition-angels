import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Repo split (specs/bloomos-repo-split.md): BloomOS serves only the app.
// The Ambition Angels website, and the 308s from its old links to
// app.bloomos.org, live in the ambition-angels repo now.

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(async () => ({
    response: NextResponse.next(),
    hasUser: false,
    userId: null,
    supabase: null,
    twoStep: "ok",
  })),
}));

import { middleware, config } from "@/middleware";
import { manageUrl } from "@/lib/email/format";

const at = (host: string, path: string, method = "GET") =>
  middleware(new NextRequest(`https://${host}${path}`, { method, headers: { host } }));

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://app.bloomos.org");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("app only", () => {
  test.each(["app.bloomos.org", "bloomos-git-x.vercel.app", "localhost"])("/ goes to /admin on %s", async (host) => {
    const res = await at(host, "/");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/admin");
  });

  test.each(["/board/signin", "/meet", "/meet/intro-call", "/strategy", "/coach/me/tok"])(
    "%s is served, not redirected",
    async (p) => {
      const res = await at("app.bloomos.org", p);
      expect(res.status).toBe(200);
    },
  );

  test("the middleware no longer matches website paths", () => {
    const m = config.matcher.join(" ");
    for (const p of ["/demoday", "/api/site-admin", "/api/unsubscribe", "/api/meet/booking"]) {
      expect(m).not.toContain(p);
    }
  });

  test("no website pages are left in the app", () => {
    for (const p of ["page.tsx", "teens", "apply", "site-admin", "ygb", "demo", "donate"]) {
      expect(existsSync(join(__dirname, "..", "app", p))).toBe(false);
    }
    for (const p of ["games", "ms", "site-admin", "create-payment-intent", "apply", "site"]) {
      expect(existsSync(join(__dirname, "..", "app", "api", p))).toBe(false);
    }
  });

  test("old Careers and Analytics bookmarks go to the website admin", () => {
    const src = readFileSync(join(__dirname, "..", "next.config.mjs"), "utf8");
    expect(src).toContain('["/admin/careers", "/admin/careers"]');
    expect(src).toContain("https://www.ambitionangels.org${path}");
  });
});

describe("email links point at the app host", () => {
  test("manage-booking link", () => {
    expect(manageUrl("tok")).toBe("https://app.bloomos.org/meet/booked/tok");
  });
});
