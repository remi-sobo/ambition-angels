"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** /admin renders its own <main> in its shell, so wrapping it again would
 *  nest two main landmarks. Every other surface (board, meet, Strategy Room,
 *  coach links, sign-in) gets one here. */
export default function MainLandmark({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname?.startsWith("/admin") ? <>{children}</> : <main>{children}</main>;
}
