import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Server-side auth gate for nested admin routes.
 *
 * /admin itself renders the monolith — which has its own client-side login
 * UI — so we deliberately let it through. Adding a redirect here for /admin
 * would create a loop (redirect /admin → /admin → …). All other /admin/*
 * routes are gated: unauthed visits bounce to /admin where the login form
 * renders.
 *
 * Auth model mirrors lib/admin/auth.ts: the cookie value must match one of
 * ADMIN_PASSWORD_REMI, ADMIN_PASSWORD_SHANNON, or the legacy ADMIN_PASSWORD.
 */
// Public assets under /admin that the browser must be able to fetch
// without an auth cookie:
//   - manifest.webmanifest: referenced from <head> on the login page so
//     iOS / Android can recognize the section as a PWA before sign-in.
//   - icon-*.png, apple-touch-icon.png, favicon-*.png: PWA app icons.
// They live in /app/admin/manifest.ts and /public/admin/, respectively.
const PUBLIC_ADMIN_PATHS = new Set([
  "/admin/manifest.webmanifest",
  "/admin/apple-touch-icon.png",
  "/admin/icon-192.png",
  "/admin/icon-512.png",
  "/admin/icon-192-maskable.png",
  "/admin/icon-512-maskable.png",
  "/admin/favicon-32.png",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Matcher already scopes us to /admin/*, but be explicit: only gate the
  // nested routes; /admin handles its own login UI.
  if (pathname === "/admin") {
    return NextResponse.next();
  }

  // PWA install assets must be reachable pre-auth.
  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("admin_auth")?.value;
  const accepted = [
    process.env.ADMIN_PASSWORD_REMI,
    process.env.ADMIN_PASSWORD_SHANNON,
    process.env.ADMIN_PASSWORD,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  if (!cookie || !accepted.includes(cookie)) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path+"],
};
