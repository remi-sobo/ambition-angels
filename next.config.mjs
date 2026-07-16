/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    // Cutover (migration runbook step 14): the admin now lives at
    // app.bloomos.org. Old links, bookmarks, and installed PWAs on the AA
    // host land there via a permanent (308) redirect — method-preserving, so
    // in-flight POSTs from a stale PWA shell survive the hop. Host-matched:
    // the app host itself, previews, and localhost are untouched. This stays
    // forever (links in sent email never die).
    return ["www.ambitionangels.org", "ambitionangels.org"].map((host) => ({
      source: "/admin/:path*",
      has: [{ type: "host", value: host }],
      destination: "https://app.bloomos.org/admin/:path*",
      permanent: true,
    }));
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
