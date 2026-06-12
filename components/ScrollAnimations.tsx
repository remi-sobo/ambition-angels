"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Sitewide scroll-triggered animations. Watches every `.fade-up` element and
 * adds `.visible` when it enters the viewport (see globals.css). Re-scans on
 * route change so server-rendered pages animate after client navigation.
 */
export default function ScrollAnimations() {
  const pathname = usePathname();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".fade-up:not(.visible)").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
