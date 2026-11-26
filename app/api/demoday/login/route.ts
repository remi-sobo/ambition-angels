import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/security/safeEqual";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Shared-password login for the /demoday lookbook gate (see middleware.ts).
 * Accepts a form POST (the gate page is a plain <form>) or JSON. On success
 * sets the demoday_auth cookie and redirects back to /demoday; on failure
 * redirects to /demoday?error=1 so the gate re-renders with an error.
 */
export async function POST(req: NextRequest) {
  // Shared password: throttle guessing per IP.
  const rl = rateLimit(`demoday-login:${getClientIp(req)}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) return NextResponse.redirect(new URL("/demoday?error=1", req.url), 303);

  const expected = process.env.DEMODAY_PASSWORD;

  let password: string | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
    password = body && typeof body.password === "string" ? body.password : null;
  } else {
    const form = await req.formData().catch(() => null);
    const value = form?.get("password");
    password = typeof value === "string" ? value : null;
  }

  if (!expected || !password || !safeEqual(password, expected)) {
    return NextResponse.redirect(new URL("/demoday?error=1", req.url), 303);
  }

  const res = NextResponse.redirect(new URL("/demoday", req.url), 303);
  res.cookies.set("demoday_auth", expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
