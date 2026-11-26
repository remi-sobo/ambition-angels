/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    // Baseline security headers (security/baseline-2026-11). The CSP is
    // report-only on purpose: watch the browser console on the donate page,
    // the teen games, /ygb, /update/koshland and /demo before enforcing it.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.stripe.com https://*.supabase.co",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.youtube-nocookie.com https://drive.google.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
  experimental: {
    // The My Ambition partner demo (demo-assets/ambition-demo.html) lives
    // outside public/ on purpose — public/ is served with no auth — and is
    // read from disk by the gated /demo/app route handler. Files outside the
    // normal build graph are not in the serverless bundle unless traced
    // here; without this line the route 500s in production and works on
    // localhost. Verify after the first deploy.
    outputFileTracingIncludes: { "/demo/app": ["./demo-assets/**"] },
  },
  async redirects() {
    // BloomOS features that used to live on this site now live at
    // app.bloomos.org (specs/bloomos-repo-split.md §6f). Permanent (308, so a
    // POSTed unsubscribe or booking action keeps its method) and kept forever:
    // links in sent email never die. /admin/* is handled in middleware.ts,
    // because the website admin owns a few /admin paths.
    const BLOOMOS = "https://app.bloomos.org";
    return [
      ...[
        "/board",
        "/board/:path*",
        "/meet",
        "/meet/:path*",
        "/strategy",
        "/coach/me/:token",
        "/api/unsubscribe",
        "/api/meet/booking/:token/:action",
      ].map((source) => ({ source, destination: `${BLOOMOS}${source}`, permanent: true })),
      // /ms → /teens (specs/c1d2c9e2-teengamesv1): the middle-school game
      // moved under the /teens games hub. Permanent (308) so every card,
      // flyer, and deck email already in circulation keeps working — the
      // bare route lands on the hub, deep links (deck codes, live room
      // screens, mid-session results) land on the same page at its new
      // path. Query strings (?room=, ?host=) survive the hop automatically.
      { source: "/ms", destination: "/teens", permanent: true },
      { source: "/ms/:path*", destination: "/teens/built-for/:path*", permanent: true },
      // Site v2 (specs/site-redesign-v2.md): old URLs keep working.
      { source: "/for-adults", destination: "/guides", permanent: true },
      { source: "/the-app", destination: "/how-it-works", permanent: true },
      { source: "/careers", destination: "/curriculum", permanent: true },
      { source: "/careers/:slug", destination: "/curriculum/:slug", permanent: true },
    ];
  },
  async rewrites() {
    return [
      // Serve the self-contained Fast Forward demo-day lookbook (a static
      // file in public/demoday/) at the clean URL /demoday in both `next dev`
      // and on Vercel.
      { source: "/demoday", destination: "/demoday/index.html" },
      // Donor signup form for Demo Day (static file in public/demoday/signup/).
      // Served at the clean URL /demoday/signup. Intentionally NOT added to the
      // middleware matcher, so it stays publicly reachable (donors shouldn't
      // need the lookbook password to sign up).
      { source: "/demoday/signup", destination: "/demoday/signup/index.html" },
    ];
  },
};

export default nextConfig;
