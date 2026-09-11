import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { DEMO_COOKIE, cookieIsValid } from "@/lib/demo/auth";

/**
 * GET /demo/app — serves the self-contained My Ambition demo bundle, but
 * only to a request carrying a valid ma_demo cookie. Everyone else gets a
 * 302 to /demo with no HTML body, so the file is never observable without
 * the password.
 *
 * The bundle lives in demo-assets/ at the repo root, deliberately outside
 * public/ (which Next serves with no auth). It is read from disk once and
 * cached at module scope. Because it sits outside the normal build output,
 * next.config.mjs lists it in outputFileTracingIncludes so it ships in the
 * serverless bundle — a missing traced file is the one way this 500s in
 * production while working on localhost.
 */

export const dynamic = "force-dynamic";

const BUNDLE_PATH = path.join(process.cwd(), "demo-assets", "ambition-demo.html");

let cached: string | null = null;
function bundle(): string {
  if (cached === null) cached = readFileSync(BUNDLE_PATH, "utf8");
  return cached;
}

export async function GET(req: NextRequest) {
  if (!cookieIsValid(req.cookies.get(DEMO_COOKIE)?.value)) {
    return NextResponse.redirect(new URL("/demo", req.url), 302);
  }
  return new NextResponse(bundle(), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
