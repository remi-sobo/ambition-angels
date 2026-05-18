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
  const standalone =
    (pathname?.startsWith("/shannon") ||
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
