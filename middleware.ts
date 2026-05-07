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
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Matcher already scopes us to /admin/*, but be explicit: only gate the
  // nested routes; /admin handles its own login UI.
  if (pathname === "/admin") {
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
