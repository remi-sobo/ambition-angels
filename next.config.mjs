/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    // Cutover (migration runbook step 14): the admin now lives at
    // app.bloomos.org. Old links, bookmarks, and installed PWAs on the AA
    // host land there via a permanent (308) redirect — method-preserving, so
    // in-flight POSTs from a stale PWA shell survive the hop. Host-matched:
    // the app host itself, previews, and localhost are untouched. This stays
    // forever (links in sent email never die).
    return [
      ...["www.ambitionangels.org", "ambitionangels.org"].map((host) => ({
        source: "/admin/:path*",
        has: [{ type: "host", value: host }],
        destination: "https://app.bloomos.org/admin/:path*",
        permanent: true,
      })),
      // /ms → /teens (specs/c1d2c9e2-teengamesv1): the middle-school game
      // moved under the /teens games hub. Permanent (308) so every card,
      // flyer, and deck email already in circulation keeps working — the
      // bare route lands on the hub, deep links (deck codes, live room
      // screens, mid-session results) land on the same page at its new
      // path. Query strings (?room=, ?host=) survive the hop automatically.
      { source: "/ms", destination: "/teens", permanent: true },
      { source: "/ms/:path*", destination: "/teens/built-for/:path*", permanent: true },
      // /for-adults folded into /schools (website build plan v3 follow-up):
      // parent/mentor content is now a section there, so old Guide links
      // land on the page that replaced it.
      { source: "/for-adults", destination: "/schools", permanent: true },
      // ── BloomOS V2 redirect map (Spec B, stage B2) ────────────────────
      // Permanent (308) V1 → V2 moves for the 1:1 rows of the Stage 0 map
      // (docs/v2-recon.md §F.1). Every destination is a live host page
      // rendering the V1 screen behind the same module gate, so nothing
      // 404s and nothing is lost. Server-side is mandatory: notifications
      // rows and sent emails carry V1 paths forever. NEVER removed.
      //
      // Canonical map + activation states: lib/admin/v2routes.ts.
      // tests/redirects-v2.test.ts asserts this list and the map agree —
      // when activating an at-cutover row, edit both.
      //
      // uuid-child rows match only uuid-shaped children on purpose, so
      // named siblings that are NOT moving yet (/admin/staff/reviews,
      // /admin/meetings/connections, /admin/meetings/booking-page) stay put
      // without a fragile exclusion list.
      { source: "/admin/strategic-plan", destination: "/admin/organization/strategy", permanent: true },
      { source: "/admin/ops", destination: "/admin/work/tasks", permanent: true },
      { source: "/admin/ops/my-week", destination: "/admin/work/my-week", permanent: true },
      { source: "/admin/ops/projects/:path*", destination: "/admin/work/projects/:path*", permanent: true },
      { source: "/admin/meetings", destination: "/admin/work/meetings", permanent: true },
      { source: "/admin/meetings/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})", destination: "/admin/work/meetings/:id", permanent: true },
      { source: "/admin/meetings/upcoming/:path*", destination: "/admin/work/meetings/upcoming/:path*", permanent: true },
      { source: "/admin/staff", destination: "/admin/organization/team", permanent: true },
      { source: "/admin/staff/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})", destination: "/admin/organization/team/:id", permanent: true },
      { source: "/admin/documents/:path*", destination: "/admin/work/documents/:path*", permanent: true },
      { source: "/admin/finance", destination: "/admin/finance/snapshot", permanent: true },
      { source: "/admin/finance/report", destination: "/admin/finance/reports", permanent: true },
      { source: "/admin/analytics", destination: "/admin/impact/analytics", permanent: true },
      { source: "/admin/kpis", destination: "/admin/impact/kpis", permanent: true },
      { source: "/admin/students/:path*", destination: "/admin/programs/people/:path*", permanent: true },
      { source: "/admin/intake", destination: "/admin/programs/intake", permanent: true },
      { source: "/admin/cohorts/:path*", destination: "/admin/programs/cohorts/:path*", permanent: true },
      { source: "/admin/program", destination: "/admin/programs/overview", permanent: true },
      { source: "/admin/partners/:path*", destination: "/admin/programs/partners/:path*", permanent: true },
      { source: "/admin/careers", destination: "/admin/programs/content", permanent: true },
      { source: "/admin/board/:path*", destination: "/admin/organization/board/:path*", permanent: true },
      { source: "/admin/compliance/:path*", destination: "/admin/organization/compliance/:path*", permanent: true },
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
