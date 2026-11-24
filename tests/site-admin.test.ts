import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Repo split §6d: the Ambition Angels website admin at ambitionangels.org/admin.

vi.mock("server-only", () => ({}));
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

  test("/site-admin is not a public address there: it redirects to /admin", async () => {
    const res = await at("www.ambitionangels.org", "/site-admin/careers");
    expect(res.status).toBe(308);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/admin/careers");
  });
});

describe("on a preview address", () => {
  test("the website admin works the same way, so it can be tested before the domain moves", async () => {
    expect(rewriteOf(await at("ambition-angels-site.vercel.app", "/admin/careers"))).toBe("/site-admin/careers");
    const res = await at("ambition-angels-site.vercel.app", "/admin/today");
    expect(res.headers.get("location")).toBe("https://app.bloomos.org/admin/today");
  });
});

describe("access", () => {
  test("SITE_ADMIN_EMAILS is trimmed, lowercased, and junk-free", () => {
    expect(siteAdminEmails()).toEqual(["remi@ambitionangels.org", "shannon@ambitionangels.org"]);
    expect(isSiteAdminEmail("REMI@ambitionangels.org")).toBe(true);
    expect(isSiteAdminEmail("someone@ambitionangels.org")).toBe(false);
    expect(isSiteAdminEmail(null)).toBe(false);
  });

  test("every /api/site-admin route checks requireSiteAdmin (sign-in, sign-out and the BloomOS stats feed excepted)", () => {
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
    const guarded = files.filter((f) => !/\/(signin|signout|stats)\/route\.ts$/.test(f));
    expect(guarded.length).toBeGreaterThanOrEqual(8);
    for (const f of guarded) expect(readFileSync(f, "utf8"), f).toMatch(/await requireSiteAdmin\(\)/);
    // The stats feed is BloomOS's, machine to machine: its guard is the bearer key.
    const stats = readFileSync(join(root, "stats", "route.ts"), "utf8");
    expect(stats).toMatch(/if \(!keyMatches\(req\.headers\.get\("authorization"\)\)\)/);
    expect(stats).toMatch(/timingSafeEqual/);
  });

  test("the website admin layout mounts the providers the shared admin components need", () => {
    const layout = readFileSync(join(__dirname, "..", "app", "site-admin", "layout.tsx"), "utf8");
    expect(layout).toMatch(/<ToastProvider>/);
    expect(layout).toMatch(/<ConfirmProvider>/);
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
