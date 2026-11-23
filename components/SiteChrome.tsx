"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import ScrollAnimations from "@/components/ScrollAnimations";

export default function SiteChrome({
  nav,
  footer,
  jsonLd,
  children,
}: {
  nav: ReactNode;
  footer: ReactNode;
  /** Serialized Organization JSON-LD — public pages only, so standalone
   *  surfaces (/admin is a shared multi-tenant host) carry no AA identity. */
  jsonLd?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Routes that render their own chrome end-to-end. The public <Nav> is
  // position:fixed so leaving it visible over any page that doesn't account
  // for its 64/80px height causes the page heading to slide behind it
  // (see /admin — its sidebar shell is the chrome, no public nav needed).
  // /teens itself (the hub) and the career quiz are part of the site — full
  // Nav + Footer. The game screens under /teens/* keep their own immersive
  // chrome: a fixed marketing nav over a projected room screen or a
  // mid-game view would fight the game.
  const teensGameScreen =
    (pathname?.startsWith("/teens/") &&
      !pathname?.startsWith("/teens/career-quiz")) ??
    false;
  const standalone =
    (pathname?.startsWith("/admin") ||
      // The board portal carries its own header and footer end to end, and a
      // fixed marketing nav over a governance surface would be wrong twice:
      // visually, and because /board is private and never advertises the site.
      pathname?.startsWith("/board") ||
      teensGameScreen ||
      // The My Ambition partner demo: a password door, then the demo in a
      // full-viewport iframe. Neither wants a fixed marketing nav over it.
      pathname?.startsWith("/demo") ||
      pathname?.startsWith("/ygb") ||
      pathname?.startsWith("/shannon") ||
      pathname?.startsWith("/strategy") ||
      // BloomOS surfaces served on app.bloomos.org (repo split §6c). The
      // marketing nav's links don't exist on that host.
      pathname?.startsWith("/meet") ||
      pathname?.startsWith("/coach/me") ||
      pathname?.startsWith("/update/koshland")) ??
    false;

  return (
    <>
      {!standalone && jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      {!standalone && nav}
      {!standalone && <ScrollAnimations />}
      {/* /admin renders its own <main> in its shell; a second one around it
          made two nested main landmarks on every BloomOS page (V4 Stage P
          axe pass). */}
      {pathname?.startsWith("/admin") ? children : <main>{children}</main>}
      {!standalone && footer}
    </>
  );
}
