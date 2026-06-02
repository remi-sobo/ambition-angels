import { NextRequest, NextResponse } from "next/server";

/**
 * Shared-password login for the /strategy Strategy Room gate (see
 * middleware.ts). Accepts a form POST (the gate page is a plain <form>) or
 * JSON. On success sets the strategy_auth cookie and redirects back to
 * /strategy; on failure redirects to /strategy?error=1 so the gate
 * re-renders with an error.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.STRATEGY_ROOM_PASSWORD;

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

  if (!expected || !password || password !== expected) {
    return NextResponse.redirect(new URL("/strategy?error=1", req.url), 303);
  }

  const res = NextResponse.redirect(new URL("/strategy", req.url), 303);
  res.cookies.set("strategy_auth", expected, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
