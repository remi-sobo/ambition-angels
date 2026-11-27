import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Which /admin paths on the Ambition Angels host belong to the website admin
 * (specs/bloomos-repo-split.md §6d). A fixed list on purpose: any other
 * /admin/* path is an old BloomOS link and 308s to app.bloomos.org.
 *
 * Until split day the website admin lives in app/site-admin, and middleware
 * rewrites these paths onto it. Middleware-safe: no server-only imports.
 */
export function isSiteAdminPath(pathname: string): boolean {
  if (pathname === "/admin") return true;
  if (pathname === "/admin/careers" || pathname.startsWith("/admin/careers/")) return true;
  return ["/admin/games", "/admin/analytics", "/admin/forms", "/admin/auth/callback"].includes(pathname);
}

/** /admin/careers/pool → /site-admin/careers/pool */
export function toSiteAdminPath(pathname: string): string {
  return pathname.replace(/^\/admin/, "/site-admin");
}

/**
 * Rewrite to the website admin, refreshing its Supabase session on the way
 * so Server Components see a live token. Skips the refresh (never fails the
 * page) when the website database isn't configured.
 */
export async function rewriteToSiteAdmin(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.clone();
  url.pathname = toSiteAdminPath(req.nextUrl.pathname);
  const res = NextResponse.rewrite(url, { request: { headers: req.headers } });
  const sbUrl = process.env.SITE_SUPABASE_URL;
  const sbKey = process.env.SITE_SUPABASE_ANON_KEY;
  if (!sbUrl || !sbKey) return res;
  try {
    const supabase = createServerClient(sbUrl, sbKey, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    });
    await supabase.auth.getUser();
  } catch {
    /* a refresh failure just means the page shows sign-in */
  }
  return res;
}
