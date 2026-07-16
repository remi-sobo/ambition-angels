import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Host guard + server-side auth gates.
 *
 * Host guard (BloomOS core fence, Phase A1): app.bloomos.org serves ONLY the
 * admin surface — "/" 307s to /admin, and any path outside /admin, /auth, and
 * /api returns a minimal 404 so AA's marketing site never renders on the app
 * host. ambitionangels.org behavior is unchanged. localhost and Vercel preview
 * hosts are both-capable (marketing + admin); test the app-host branch locally
 * with a hosts-file entry for app.bloomos.org.
 *
 * Auth gates for three areas:
 *
 *  1. /admin/* — the operating system. /admin itself renders the monolith
 *     (with its own client-side login UI), so it's let through; all nested
 *     routes are gated and bounce to /admin when there is no signed-in user.
 *     Auth is the Supabase session cookie, refreshed here via updateSession();
 *     this is a coarse "is anyone signed in" gate only. Real membership and
 *     permission enforcement lives in route handlers (getOrgContext in
 *     lib/admin/auth.ts) and RLS.
 *
 *  2. /demoday — the static Fast Forward demo-day lookbook (rewritten to
 *     /demoday/index.html). Both entry points sit behind a shared password
 *     (DEMODAY_PASSWORD) so the file isn't world-readable. Logged-in admins
 *     pass through without re-entering it. Fails closed: if DEMODAY_PASSWORD
 *     is unset, only admins can view.
 *
 *  3. /strategy — the internal Strategy Room (funder/partner framing
 *     reference). Same shape as the demoday gate: a shared password
 *     (STRATEGY_ROOM_PASSWORD) sets the strategy_auth cookie via
 *     /api/strategy/login. Logged-in admins pass through. Fails closed: if
 *     STRATEGY_ROOM_PASSWORD is unset, only admins can view.
 */

// Hosts that serve only the admin app. The PUBLIC_ADMIN_PATHS assets below
// all live under /admin/, so the prefix allowlist covers them.
const APP_HOSTS = new Set(["app.bloomos.org"]);
const APP_HOST_PREFIXES = ["/admin", "/auth", "/api"];

function requestHost(req: NextRequest): string {
  // Vercel terminates at the edge, so the original host arrives in
  // x-forwarded-host; plain `host` covers local dev. Strip any port.
  const raw = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return raw.split(",")[0].trim().split(":")[0].toLowerCase();
}

function isAppHostPath(pathname: string): boolean {
  return APP_HOST_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function appHostNotFound(): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>404</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0E0E0E;background:#FAFAF8">
<main style="text-align:center"><h1 style="font-size:22px;margin:0 0 6px">404</h1><p style="margin:0;color:#6B6960;font-size:14px">This page doesn&rsquo;t exist on this host.</p></main>
</body>
</html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

// Public assets under /admin that the browser must be able to fetch
// without an auth cookie (PWA manifest + icons, and the logo mark shown
// on the unauthenticated login screen).
const PUBLIC_ADMIN_PATHS = new Set([
  "/admin/manifest.webmanifest",
  "/admin/apple-touch-icon.png",
  "/admin/icon-192.png",
  "/admin/icon-512.png",
  "/admin/icon-192-maskable.png",
  "/admin/icon-512-maskable.png",
  "/admin/favicon-32.png",
  "/admin/bloomos-mark.png",
  "/admin/login-art.webp",
]);

// The lookbook's two reachable URLs. /demoday/favicon.png is intentionally
// NOT gated so the gate page can display it.
const DEMODAY_PATHS = new Set(["/demoday", "/demoday/index.html"]);

function isDemodayAuthed(req: NextRequest, hasUser: boolean): boolean {
  const expected = process.env.DEMODAY_PASSWORD;
  const cookie = req.cookies.get("demoday_auth")?.value;
  if (expected && cookie === expected) return true;
  // Signed-in BloomOS users don't need the shared password.
  return hasUser;
}

function isStrategyAuthed(req: NextRequest, hasUser: boolean): boolean {
  const expected = process.env.STRATEGY_ROOM_PASSWORD;
  const cookie = req.cookies.get("strategy_auth")?.value;
  if (expected && cookie === expected) return true;
  // Signed-in BloomOS users don't need the shared password.
  return hasUser;
}

function strategyGateHtml(error: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Strategy Room · Ambition Angels</title>
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
    <h1>Strategy Room</h1>
    <p class="sub">This page is internal. Enter the team password to continue.</p>
    <form method="POST" action="/api/strategy/login">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
      <button type="submit">Open the room</button>
      ${error ? '<p class="err">Incorrect password. Please try again.</p>' : ""}
    </form>
  </main>
</body>
</html>`;
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── App-host guard ────────────────────────────────────────────────────
  // On app.bloomos.org, only the admin surface exists: "/" redirects to
  // /admin, admin/auth/api paths fall through to the gates below, and
  // everything else (AA's marketing routes) 404s.
  if (APP_HOSTS.has(requestHost(req))) {
    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url, 307);
    }
    if (!isAppHostPath(pathname)) return appHostNotFound();
  }

  // ── Session-backed API routes ─────────────────────────────────────────
  // /api/admin/* and /api/reed/* authenticate via the Supabase session
  // (getOrgContext). Refresh the token here and forward the fresh cookies so
  // a long-open tab re-auths transparently instead of the handler seeing an
  // expired token and returning 401 (page loads already refresh via the gate
  // below; API calls didn't, so an aged tab's fetch would fail). No page
  // gates or redirects for API paths — the handler does its own authz, and an
  // unauthenticated API call must get its own JSON 401, never an HTML bounce.
  if (pathname.startsWith("/api/")) {
    const { response } = await updateSession(req);
    return response;
  }

  // Paths matched only for the app-host guard (the broad matcher entry) pass
  // straight through on every other host — marketing behavior is unchanged,
  // and updateSession() never runs where it didn't before this guard existed.
  const gated =
    pathname.startsWith("/admin/") || DEMODAY_PATHS.has(pathname) || pathname === "/strategy";
  if (!gated) return NextResponse.next();

  // Refresh the Supabase session on every matched request and learn whether
  // a signed-in user is present. Coarse gate only — membership/permission
  // enforcement lives in route handlers + RLS.
  const { response, hasUser } = await updateSession(req);

  // ── Demo-day lookbook gate ────────────────────────────────────────────
  if (DEMODAY_PATHS.has(pathname)) {
    if (isDemodayAuthed(req, hasUser)) return response;
    const error = req.nextUrl.searchParams.get("error") === "1";
    return new NextResponse(demodayGateHtml(error), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // ── Strategy Room gate ────────────────────────────────────────────────
  // The /strategy page renders its own React UI once authed; until then we
  // serve a branded password gate here so the page never reaches the client.
  if (pathname === "/strategy") {
    if (isStrategyAuthed(req, hasUser)) return response;
    const error = req.nextUrl.searchParams.get("error") === "1";
    return new NextResponse(strategyGateHtml(error), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // ── Admin gate ────────────────────────────────────────────────────────
  // /admin handles its own login UI; let it through to avoid a redirect loop.
  if (pathname === "/admin") {
    return response;
  }
  // PWA install assets must be reachable pre-auth.
  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    return response;
  }
  if (!hasUser) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  return response;
}

export const config = {
  matcher: [
    "/admin/:path+",
    // Session-backed API surfaces: refreshed (not gated) so a long-open tab's
    // fetch re-auths instead of 401ing on an expired token. Cron API routes
    // authenticate with a secret, not a session, so they're deliberately out.
    "/api/admin/:path*",
    "/api/reed/:path*",
    "/demoday",
    "/demoday/index.html",
    "/strategy",
    // Host-guard coverage: "/" and extension-less page paths, so the app host
    // can redirect/404 them. Excludes /api and Next internals; files with an
    // extension (static assets) are left alone. Non-app hosts pass straight
    // through via the `gated` early return above.
    "/((?!api/|_next/|.*\\.[^/]+$).*)",
  ],
};
