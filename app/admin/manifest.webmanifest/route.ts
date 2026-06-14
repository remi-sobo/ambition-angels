import { NextResponse } from "next/server";

/**
 * Web app manifest for the /admin PWA.
 *
 * Next.js' `manifest.ts` file convention is only recognized at the app
 * root (`app/manifest.ts`), which would publish a single manifest for
 * the entire marketing site. We want one scoped to /admin instead — so
 * we serve it from this route handler. The URL stays the same as the
 * convention would have produced: /admin/manifest.webmanifest.
 *
 * Scope is locked to /admin so installing the PWA only captures admin
 * URLs; the marketing site remains a normal website.
 */
const manifest = {
  name: "BloomOS",
  short_name: "BloomOS",
  description:
    "BloomOS — operating system for Ambition Angels. Fundraising, ops, finance, board, program.",
  id: "/admin",
  start_url: "/admin",
  scope: "/admin",
  display: "standalone",
  orientation: "any",
  background_color: "#17140F",
  // Matches the warm espresso BloomOS chrome (mobile top bar / sidebar).
  theme_color: "#262019",
  categories: ["productivity", "business"],
  icons: [
    {
      src: "/admin/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/admin/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/admin/icon-192-maskable.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/admin/icon-512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

export function GET() {
  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
