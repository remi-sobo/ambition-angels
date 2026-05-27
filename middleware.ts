import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Server-side auth gates for two areas:
 *
 *  1. /admin/* — the operating system. /admin itself renders the monolith
 *     (with its own client-side login UI), so it's let through; all nested
 *     routes are gated and bounce to /admin when unauthed. Auth mirrors
 *     lib/admin/auth.ts: the admin_auth cookie must match one of
 *     ADMIN_PASSWORD_REMI, ADMIN_PASSWORD_SHANNON, or the legacy ADMIN_PASSWORD.
 *
 *  2. /demoday — the static Fast Forward demo-day lookbook (rewritten to
 *     /demoday/index.html). Both entry points sit behind a shared password
 *     (DEMODAY_PASSWORD) so the file isn't world-readable. Logged-in admins
 *     pass through without re-entering it. Fails closed: if DEMODAY_PASSWORD
 *     is unset, only admins can view.
 */

// Public assets under /admin that the browser must be able to fetch
// without an auth cookie (PWA manifest + icons).
const PUBLIC_ADMIN_PATHS = new Set([
  "/admin/manifest.webmanifest",
  "/admin/apple-touch-icon.png",
  "/admin/icon-192.png",
  "/admin/icon-512.png",
  "/admin/icon-192-maskable.png",
  "/admin/icon-512-maskable.png",
  "/admin/favicon-32.png",
]);

// The lookbook's two reachable URLs. /demoday/favicon.png is intentionally
// NOT gated so the gate page can display it.
const DEMODAY_PATHS = new Set(["/demoday", "/demoday/index.html"]);

function acceptedAdminCookies(): string[] {
  return [
    process.env.ADMIN_PASSWORD_REMI,
    process.env.ADMIN_PASSWORD_SHANNON,
    process.env.ADMIN_PASSWORD,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
}

function isAdminAuthed(req: NextRequest): boolean {
  const cookie = req.cookies.get("admin_auth")?.value;
  return !!cookie && acceptedAdminCookies().includes(cookie);
}

function isDemodayAuthed(req: NextRequest): boolean {
  const expected = process.env.DEMODAY_PASSWORD;
  const cookie = req.cookies.get("demoday_auth")?.value;
  if (expected && cookie === expected) return true;
  // Logged-in admins don't need the shared password.
  return isAdminAuthed(req);
}

function demodayGateHtml(error: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Fast Forward Demo Day · Ambition Angels</title>
<link rel="icon" type="image/png" href="/demoday/favicon.png">
<style>
  :root { --orange:#E8500A; --ink:#0E0E0E; --cream:#FAFAF8; --gray:#6B6960; --line:#E5E2DA; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:var(--cream); color:var(--ink); padding:24px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .card { width:100%; max-width:400px; background:#fff; border:1px solid var(--line);
    border-radius:20px; padding:36px 32px; box-shadow:0 8px 40px rgba(14,14,14,0.06); }
  .eyebrow { font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
    color:var(--orange); margin:0 0 8px; }
  h1 { font-size:24px; line-height:1.2; margin:0 0 6px; font-weight:800; }
  p.sub { margin:0 0 24px; color:var(--gray); font-size:14px; line-height:1.5; }
  label { display:block; font-size:12px; font-weight:600; margin:0 0 6px; color:var(--ink); }
  input[type=password] { width:100%; padding:12px 14px; font-size:15px; border:1px solid var(--line);
    border-radius:12px; outline:none; transition:border-color .15s; }
  input[type=password]:focus { border-color:var(--orange); }
  button { width:100%; margin-top:16px; padding:12px 14px; font-size:15px; font-weight:700;
    color:#fff; background:var(--orange); border:none; border-radius:12px; cursor:pointer;
    transition:opacity .15s; }
  button:hover { opacity:.92; }
  .err { margin:14px 0 0; padding:10px 12px; border-radius:10px; background:#FCE8E0;
    color:#B83D06; font-size:13px; }
</style>
</head>
<body>
  <main class="card">
    <p class="eyebrow">Ambition Angels</p>
    <h1>Fast Forward Demo Day</h1>
    <p class="sub">This lookbook is private. Enter the access password to continue.</p>
    <form method="POST" action="/api/demoday/login">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
      <button type="submit">View lookbook</button>
      ${error ? '<p class="err">Incorrect password. Please try again.</p>' : ""}
    </form>
  </main>
</body>
</html>`;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Demo-day lookbook gate ────────────────────────────────────────────
  if (DEMODAY_PATHS.has(pathname)) {
    if (isDemodayAuthed(req)) return NextResponse.next();
    const error = req.nextUrl.searchParams.get("error") === "1";
    return new NextResponse(demodayGateHtml(error), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // ── Admin gate ────────────────────────────────────────────────────────
  // /admin handles its own login UI; let it through to avoid a redirect loop.
  if (pathname === "/admin") {
    return NextResponse.next();
  }
  // PWA install assets must be reachable pre-auth.
  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return NextResponse.next();
  }
  if (!isAdminAuthed(req)) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path+", "/demoday", "/demoday/index.html"],
};
