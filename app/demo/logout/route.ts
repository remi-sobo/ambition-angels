import { NextRequest, NextResponse } from "next/server";
import { DEMO_COOKIE, demoCookieOptions } from "@/lib/demo/auth";

/** GET /demo/logout — clears the ma_demo cookie and returns to the password screen. */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/demo", req.url), 303);
  res.cookies.set(DEMO_COOKIE, "", { ...demoCookieOptions(), maxAge: 0 });
  return res;
}
