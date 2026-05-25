"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function SiteChrome({
  nav,
  footer,
  children,
}: {
  nav: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Routes that render their own chrome end-to-end. The public <Nav> is
  // position:fixed so leaving it visible over any page that doesn't account
  // for its 64/80px height causes the page heading to slide behind it
  // (see /admin — its sidebar shell is the chrome, no public nav needed).
  const standalone =
    (pathname?.startsWith("/admin") ||
      pathname?.startsWith("/ygb") ||
      pathname?.startsWith("/shannon") ||
      pathname?.startsWith("/update/koshland")) ??
    false;

  return (
    <>
      {!standalone && nav}
      <main>{children}</main>
      {!standalone && footer}
    </>
  );
}
