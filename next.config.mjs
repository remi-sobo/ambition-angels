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
      // Home cutover (Spec Home, H3). /admin itself is NOT here: it hosts the
      // login UI, so its forward is auth-aware in app/admin/page.tsx.
      { source: "/admin/queue", destination: "/admin/today", permanent: true },
      { source: "/admin/briefing", destination: "/admin/today", permanent: true },
      // Fundraising cutover (Spec Fundraising, F6). Row-for-row with the
      // canonical map, same order. prospects is exact + uuid-child so
      // /prospects/import and /prospects/by-hubspot/* stay live; plan and
      // acknowledgments are exact so their named children stay live too.
      { source: "/admin/fundraising", destination: "/admin/fundraising/today", permanent: true },
      { source: "/admin/fundraising/plan", destination: "/admin/fundraising/campaigns", permanent: true },
      { source: "/admin/fundraising/donors/:path*", destination: "/admin/fundraising/donors-funders/:path*", permanent: true },
      { source: "/admin/fundraising/prospects", destination: "/admin/fundraising/donors-funders", permanent: true },
      { source: "/admin/fundraising/prospects/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})", destination: "/admin/fundraising/donors-funders/:id", permanent: true },
      { source: "/admin/fundraising/asks/:path*", destination: "/admin/fundraising/pipeline/:path*", permanent: true },
      { source: "/admin/fundraising/acknowledgments", destination: "/admin/fundraising/today", permanent: true },
      { source: "/admin/fundraising/recurring", destination: "/admin/fundraising/donors-funders", permanent: true },
      { source: "/admin/fundraising/journeys", destination: "/admin/fundraising/donors-funders", permanent: true },
      // Finance cutover (Spec Finance, N4). Row-for-row with the canonical
      // map's redirect view: the same-path fixed points (transactions,
      // forecast) are deliberately ABSENT (a self-redirect would loop);
      // pledges is exact so pledges/[id] stays live.
      { source: "/admin/finance/reconcile", destination: "/admin/finance/transactions", permanent: true },
      { source: "/admin/finance/close", destination: "/admin/finance/transactions", permanent: true },
      { source: "/admin/finance/model", destination: "/admin/finance/forecast", permanent: true },
      { source: "/admin/finance/revenue", destination: "/admin/finance/forecast", permanent: true },
      { source: "/admin/fundraising/pledges", destination: "/admin/finance/forecast", permanent: true },
      // Work cutover (Spec Work, W4). Row-for-row with the canonical map:
      // both rituals land on Plan & Close (which hosts them since W1),
      // Calendar folds into My Week (?week=/?owner= ride the 308), and
      // connections lands on Meetings, which embeds the pipeline (W3).
      // All exact; booking-page stays live and unlisted (settings row).
      { source: "/admin/ops/monday", destination: "/admin/work/plan-close", permanent: true },
      { source: "/admin/ops/friday", destination: "/admin/work/plan-close", permanent: true },
      { source: "/admin/calendar", destination: "/admin/work/my-week", permanent: true },
      { source: "/admin/meetings/connections", destination: "/admin/work/meetings", permanent: true },
      // Programs cutover (Spec Programs, P4). One move: volunteers re-aimed
      // per decision 1 at the one-list's volunteers view (they are
      // constituents, not students). Demo Day and careers/daily|pool
      // deliberately stay put (R8/R9 October revisit; NO_HOME with Content's
      // own links).
      { source: "/admin/fundraising/volunteers", destination: "/admin/fundraising/donors-funders?view=volunteers", permanent: true },
      // Impact cutover (Spec Impact, I4). One move: the KPI scorecard onto
      // KPIs (which embeds the owner cards since I3). Exact — the other
      // strategic-plan children are Organization's and stay put.
      { source: "/admin/strategic-plan/scorecard", destination: "/admin/impact/kpis", permanent: true },
      // Organization cutover (Spec Org, O2). Strategy's children move to the
      // O1 child hosts; setup/narrative/people/staff-reviews stay put.
      { source: "/admin/strategic-plan/objective/:path*", destination: "/admin/organization/strategy/objective/:path*", permanent: true },
      { source: "/admin/strategic-plan/review", destination: "/admin/organization/strategy/review", permanent: true },
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
