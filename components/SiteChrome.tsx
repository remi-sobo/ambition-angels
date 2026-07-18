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
  const standalone =
    (pathname?.startsWith("/admin") ||
      pathname === "/ms" ||
      pathname?.startsWith("/ms/") ||
      pathname?.startsWith("/ygb") ||
      pathname?.startsWith("/shannon") ||
      pathname?.startsWith("/strategy") ||
      pathname?.startsWith("/update/koshland")) ??
    false;

  return (
    <>
      {!standalone && jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      {!standalone && nav}
      {!standalone && <ScrollAnimations />}
      <main>{children}</main>
      {!standalone && footer}
    </>
  );
}
