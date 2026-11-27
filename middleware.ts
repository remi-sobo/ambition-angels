import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSiteAdminPath, rewriteToSiteAdmin } from "@/lib/site/adminRoutes";

/**
 * The Ambition Angels website's middleware.
 *
 * /admin is the website admin (specs/bloomos-repo-split.md §6d). It owns
 * a fixed list of paths (lib/site/adminRoutes.ts), rewritten onto
 * app/site-admin. Every other /admin/* path is an old BloomOS link and
 * 308s to app.bloomos.org, forever. /site-admin itself is not a public
 * address: it redirects to its /admin form. Sign-in is checked again in
 * every website admin page and /api/site-admin route.
 *
 * The other old BloomOS addresses (/board, /meet, /strategy, coach pages,
 * unsubscribe and booking links) redirect from next.config.mjs.
 */

const BLOOMOS_APP = "https://app.bloomos.org";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (isSiteAdminPath(pathname)) return rewriteToSiteAdmin(req);
    return NextResponse.redirect(`${BLOOMOS_APP}${pathname}${req.nextUrl.search}`, 308);
  }
  if (pathname === "/site-admin" || pathname.startsWith("/site-admin/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/site-admin/, "/admin");
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/site-admin", "/site-admin/:path*"],
};
