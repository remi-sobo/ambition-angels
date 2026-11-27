import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSiteAdminPath, rewriteToSiteAdmin } from "@/lib/site/adminRoutes";

/**
 * The Ambition Angels website's middleware. Two jobs:
 *
 *  1. /admin is the website admin (specs/bloomos-repo-split.md §6d). It owns
 *     a fixed list of paths (lib/site/adminRoutes.ts), rewritten onto
 *     app/site-admin. Every other /admin/* path is an old BloomOS link and
 *     308s to app.bloomos.org, forever. /site-admin itself is not a public
 *     address: it redirects to its /admin form. Sign-in is checked again in
 *     every website admin page and /api/site-admin route.
 *
 *  2. /demoday, the static Fast Forward demo-day lookbook (rewritten to
 *     /demoday/index.html), sits behind a shared password (DEMODAY_PASSWORD)
 *     set by /api/demoday/login. Fails closed: with no password set, nobody
 *     gets in.
 *
 * The other old BloomOS addresses (/board, /meet, /strategy, coach pages,
 * unsubscribe and booking links) redirect from next.config.mjs.
 */

const BLOOMOS_APP = "https://app.bloomos.org";

// The lookbook's two reachable URLs. /demoday/favicon.png is intentionally
// NOT gated so the gate page can display it.
const DEMODAY_PATHS = new Set(["/demoday", "/demoday/index.html"]);

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

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (isSiteAdminPath(pathname)) return rewriteToSiteAdmin(req);
    return NextResponse.redirect(`${BLOOMOS_APP}${pathname}${req.nextUrl.search}`, 308);
  }
  if (pathname === "/site-admin" || pathname.startsWith("/site-admin/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/site-admin/, "/admin");
    return NextResponse.redirect(url, 308);
  }

  if (DEMODAY_PATHS.has(pathname)) {
    const expected = process.env.DEMODAY_PASSWORD;
    if (expected && req.cookies.get("demoday_auth")?.value === expected) return NextResponse.next();
    const error = req.nextUrl.searchParams.get("error") === "1";
    return new NextResponse(demodayGateHtml(error), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/site-admin", "/site-admin/:path*", "/demoday", "/demoday/index.html"],
};
