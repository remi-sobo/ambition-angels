import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ACTIVE_ORG_COOKIE, sessionOrgHasEntitlement } from "@/lib/admin/activeOrg";
import { twoStepApiRefusal, twoStepPageRedirect } from "@/lib/auth/twoStep";
import { isUnknownAdminPath } from "@/lib/admin/adminRoutes";

/**
 * Server-side auth gates. BloomOS serves only the app (app.bloomos.org):
 * "/" 307s to /admin on every host, and the Ambition Angels website lives in
 * its own repo and Vercel project (specs/bloomos-repo-split.md).
 *
 * Auth gates for two areas:
 *
 *  1. /admin/* — the operating system. /admin itself renders the monolith
 *     (with its own client-side login UI), so it's let through; all nested
 *     routes are gated and bounce to /admin when there is no signed-in user.
 *     Auth is the Supabase session cookie, refreshed here via updateSession();
 *     this is a coarse "is anyone signed in" gate only. Real membership and
 *     permission enforcement lives in route handlers (getOrgContext in
 *     lib/admin/auth.ts) and RLS.
 *
 *  2. /strategy — the internal Strategy Room (funder/partner framing
 *     reference). A shared password (STRATEGY_ROOM_PASSWORD) sets the
 *     strategy_auth cookie via /api/strategy/login. Signed-in users skip the
 *     password only when their active org holds aa.strategy_room. Fails
 *     closed: if STRATEGY_ROOM_PASSWORD is unset, only those users can view.
 *     The page itself is reachable only past this gate, so the gate IS the
 *     full check (funders arrive with the password and no session).
 *
 * Two-step login (pre-SafeSpace item D, lib/auth/twoStep.ts) applies to every
 * signed-in user on every /admin and /board page and every /api/admin,
 * /api/reed and /api/board route: a session below aal2 is sent to the enroll
 * screen (no verified factor yet) or the verify screen (has one); API routes
 * get a JSON 401 with code "two_step_required" instead of a redirect. The
 * session path into /strategy also needs aal2. No bypass flag.
 */

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

type Session = Awaited<ReturnType<typeof updateSession>>;

/** Shared-password OR an AA-entitled session. "Signed in" alone is not
 *  enough: a member of any other org must not see AA's internal pages. */
async function isAaPageAuthed(
  req: NextRequest,
  session: Session,
  passwordEnv: string | undefined,
  cookieName: string,
  key: "aa.strategy_room",
): Promise<boolean> {
  const cookie = req.cookies.get(cookieName)?.value;
  if (passwordEnv && cookie === passwordEnv) return true;
  if (!session.userId || !session.supabase) return false;
  // A session that has not finished two-step login is not a session here.
  if (session.twoStep !== "ok") return false;
  return sessionOrgHasEntitlement(
    session.supabase,
    session.userId,
    req.cookies.get(ACTIVE_ORG_COOKIE)?.value ?? null,
    key,
  );
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

/** Carry the refreshed Supabase cookies onto a response we build ourselves. */
function withSessionCookies(res: NextResponse, from: NextResponse): NextResponse {
  for (const c of from.cookies.getAll()) res.cookies.set(c);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── App only ──────────────────────────────────────────────────────────
  // There is no public homepage here: "/" goes straight to the admin.
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url, 307);
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
    const { response, twoStep } = await updateSession(req);
    // Signed in but short of aal2: a clear JSON 401, never an HTML bounce.
    const refusal = twoStepApiRefusal(twoStep, pathname);
    if (refusal) {
      return withSessionCookies(NextResponse.json(refusal.body, { status: refusal.status }), response);
    }
    return response;
  }

  const gated =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/board" ||
    pathname.startsWith("/board/") ||
    pathname === "/strategy";
  if (!gated) return NextResponse.next();

  // Refresh the Supabase session on every matched request and learn whether
  // a signed-in user is present. Coarse gate only — membership/permission
  // enforcement lives in route handlers + RLS.
  const session = await updateSession(req);
  const { response, hasUser } = session;

  // ── Two-step login gate ───────────────────────────────────────────────
  // Every /admin and /board page (bar the pre-auth PWA assets): a signed-in
  // session below aal2 goes to enroll or verify, carrying where it was
  // headed in ?next. Anonymous requests fall through to the gates below.
  const isAdminOrBoard =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/board" ||
    pathname.startsWith("/board/");
  if (isAdminOrBoard && !PUBLIC_ADMIN_PATHS.has(pathname)) {
    const target = twoStepPageRedirect(
      session.twoStep,
      pathname,
      req.nextUrl.search,
      req.nextUrl.searchParams.get("next"),
    );
    if (target) return withSessionCookies(NextResponse.redirect(new URL(target, req.url)), response);
  }

  // ── Strategy Room gate ────────────────────────────────────────────────
  // The /strategy page renders its own React UI once authed; until then we
  // serve a branded password gate here so the page never reaches the client.
  if (pathname === "/strategy") {
    if (
      await isAaPageAuthed(req, session, process.env.STRATEGY_ROOM_PASSWORD, "strategy_auth", "aa.strategy_room")
    ) {
      return response;
    }
    const error = req.nextUrl.searchParams.get("error") === "1";
    return new NextResponse(strategyGateHtml(error), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // ── Board portal gate ─────────────────────────────────────────────────
  // Everything under /board requires a session. /board/signin is the way in,
  // so it must stay reachable signed-out; a signed-in director who lands
  // there goes straight to the portal rather than re-requesting a link.
  // A signed-out visit to a deep link (an emailed /board/meetings/[id]) keeps
  // its destination in ?next so the magic link returns her to the page she
  // actually wanted, not to the home screen.
  if (pathname === "/board" || pathname.startsWith("/board/")) {
    if (pathname === "/board/signin") {
      if (hasUser) return NextResponse.redirect(new URL("/board", req.url));
      return response;
    }
    if (!hasUser) {
      const url = new URL("/board/signin", req.url);
      const dest = pathname + (req.nextUrl.search || "");
      if (dest !== "/board") url.searchParams.set("next", dest);
      return NextResponse.redirect(url);
    }
    return response;
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
  // V4 Stage G: an address no admin page claims answers a real 404 (not a
  // 200 with the 404 screen). The rewrite lands on the [...not_found]
  // catch-all, so the in-shell not-found page still renders.
  if (isUnknownAdminPath(pathname)) {
    const notFound = NextResponse.rewrite(new URL("/admin/__not_found", req.url), {
      status: 404,
      request: { headers: req.headers },
    });
    for (const c of response.cookies.getAll()) notFound.cookies.set(c);
    return notFound;
  }
  return response;
}

export const config = {
  matcher: [
    // /admin itself: its login UI needs the refreshed session and the
    // two-step redirect, like every page under it.
    "/admin",
    "/admin/:path+",
    // The board portal: every path under /board needs a session, and
    // /board/signin needs the refreshed session to know to bounce inward.
    "/board",
    "/board/:path*",
    // Session-backed API surfaces: refreshed (not gated) so a long-open tab's
    // fetch re-auths instead of 401ing on an expired token. Cron API routes
    // authenticate with a secret, not a session, so they're deliberately out.
    "/api/admin/:path*",
    "/api/reed/:path*",
    // Board portal APIs: refreshed, and held to the two-step rule.
    "/api/board/:path*",
    "/strategy",
    // No homepage: "/" redirects to /admin.
    "/",
  ],
};
