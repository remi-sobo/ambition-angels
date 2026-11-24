import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Repo split §6d: the Ambition Angels website admin at ambitionangels.org/admin.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(async () => ({ response: NextResponse.next(), hasUser: false, userId: null, supabase: null, twoStep: "ok" })),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { middleware } from "@/middleware";
import { isSiteAdminPath, toSiteAdminPath } from "@/lib/site/adminRoutes";
import { isSiteAdminEmail, siteAdminEmails } from "@/lib/site/adminAuth";

const at = (host: string, path: string) =>
  middleware(new NextRequest(`https://${host}${path}`, { headers: { host } }));
const rewriteOf = (res: Response) => {
  const r = res.headers.get("x-middleware-rewrite");
  return r ? new URL(r).pathname : null;
};

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://app.bloomos.org");
  vi.stubEnv("SITE_ADMIN_EMAILS", " Remi@AmbitionAngels.org, shannon@ambitionangels.org ,, nope ");
});
afterEach(() => vi.unstubAllEnvs());

describe("owned paths", () => {
  test.each(["/admin", "/admin/careers", "/admin/careers/pool", "/admin/careers/daily", "/admin/games", "/admin/analytics", "/admin/forms", "/admin/auth/callback"])(
    "%s belongs to the website admin",
    (p) => expect(isSiteAdminPath(p)).toBe(true),
  );
  test.each(["/admin/fundraising", "/admin/today", "/admin/games/x", "/admin/forms/1", "/admin/careersx", "/admin/settings"])(
    "%s does not",
    (p) => expect(isSiteAdminPath(p)).toBe(false),
  );
  test("maps onto app/site-admin", () => {
    expect(toSiteAdminPath("/admin")).toBe("/site-admin");
    expect(toSiteAdminPath("/admin/careers/pool")).toBe("/site-admin/careers/pool");
  });
});

describe("on ambitionangels.org", () => {
  test("owned /admin paths are rewritten to the website admin", async () => {
    expect(rewriteOf(await at("www.ambitionangels.org", "/admin"))).toBe("/site-admin");
    expect(rewriteOf(await at("www.ambitionangels.org", "/admin/careers/pool"))).toBe("/site-admin/careers/pool");
    expect(rewriteOf(await at("ambitionangels.org", "/admin/forms"))).toBe("/site-admin/forms");
  });

  test("every other /admin path is an old BloomOS link: 308 to the app host, query kept", async () => {
    const res = await at("www.ambitionangels.org", "/admin/fundraising/pipeline?x=1");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://app.bloomos.org/admin/fundraising/pipeline?x=1");
  });

  test("still 308s to app.bloomos.org without APP_ORIGIN, like the redirect it replaced", async () => {
    vi.stubEnv("APP_ORIGIN", "");
    const res = await at("www.ambitionangels.org", "/admin/today");
    expect(res.headers.get("location")).toBe("https://app.bloomos.org/admin/today");
  });

  test("/site-admin is not a public address there: it redirects to /admin", async () => {
    const res = await at("www.ambitionangels.org", "/site-admin/careers");
    expect(res.status).toBe(308);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/admin/careers");
  });
});

describe("on app.bloomos.org", () => {
  test("the website admin does not exist", async () => {
    expect((await at("app.bloomos.org", "/site-admin")).status).toBe(404);
    expect((await at("app.bloomos.org", "/api/site-admin/forms/retry")).status).toBe(404);
  });
  test("/admin is still BloomOS (no rewrite)", async () => {
    expect(rewriteOf(await at("app.bloomos.org", "/admin/careers"))).toBeNull();
  });
});

describe("access", () => {
  test("SITE_ADMIN_EMAILS is trimmed, lowercased, and junk-free", () => {
    expect(siteAdminEmails()).toEqual(["remi@ambitionangels.org", "shannon@ambitionangels.org"]);
    expect(isSiteAdminEmail("REMI@ambitionangels.org")).toBe(true);
    expect(isSiteAdminEmail("someone@ambitionangels.org")).toBe(false);
    expect(isSiteAdminEmail(null)).toBe(false);
  });

  test("every /api/site-admin route checks requireSiteAdmin (sign-in and sign-out excepted)", () => {
    const root = join(__dirname, "..", "app", "api", "site-admin");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (n === "route.ts") files.push(p);
      }
    };
    walk(root);
    const guarded = files.filter((f) => !/\/(signin|signout)\/route\.ts$/.test(f));
    expect(guarded.length).toBeGreaterThanOrEqual(8);
    for (const f of guarded) expect(readFileSync(f, "utf8"), f).toMatch(/await requireSiteAdmin\(\)/);
  });

  test("every website admin page checks sign-in itself, before loading anything", () => {
    // The layout's sign-in screen does not stop Next from rendering the page
    // into the same response, so a page without its own check leaks its data.
    const root = join(__dirname, "..", "app", "site-admin");
    const pages: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (n === "page.tsx") pages.push(p);
      }
    };
    walk(root);
    expect(pages.length).toBeGreaterThanOrEqual(7);
    for (const f of pages) {
      const src = readFileSync(f, "utf8");
      const body = src.slice(src.indexOf("export default async function"));
      const firstStatement = body.split("\n").slice(1).find((l) => l.trim() && !l.trim().startsWith("//"));
      expect(firstStatement?.trim(), f).toBe("if (!(await getSiteAdmin())) return null;");
    }
  });

  test("the website admin never touches a BloomOS table or the BloomOS client", () => {
    const dirs = [join(__dirname, "..", "app", "site-admin"), join(__dirname, "..", "app", "api", "site-admin")];
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(n)) files.push(p);
      }
    };
    dirs.forEach(walk);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/getSupabaseAdmin|createServerSupabase|lib\/admin\/auth"|requireAaOnly/);
    }
  });
});
