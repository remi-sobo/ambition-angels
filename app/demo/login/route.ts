import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_COOKIE,
  DEMO_COOKIE_MAX_AGE,
  demoCookieOptions,
  demoCookieValue,
  passwordMatches,
} from "@/lib/demo/auth";

/**
 * POST /demo/login — the password screen at /demo is a plain <form> that
 * posts here. Password is compared server-side in constant time
 * (lib/demo/auth.ts); on a match the signed ma_demo cookie is set and the
 * visitor is sent back to /demo, which now renders the demo. On a miss,
 * /demo?error=1 re-renders the screen with the error line. The password
 * never appears in a URL, a query string, or any client bundle.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const value = form?.get("password");
  const password = typeof value === "string" ? value : null;

  const secret = process.env.DEMO_COOKIE_SECRET;
  if (!secret || !passwordMatches(password)) {
    return NextResponse.redirect(new URL("/demo?error=1", req.url), 303);
  }

  const res = NextResponse.redirect(new URL("/demo", req.url), 303);
  res.cookies.set(DEMO_COOKIE, demoCookieValue(secret), {
    ...demoCookieOptions(),
    maxAge: DEMO_COOKIE_MAX_AGE,
  });
  return res;
}
