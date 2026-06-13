"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Sitewide scroll motion controller. Three responsibilities, all opt-in via
 * class/attribute so pages stay declarative:
 *
 *  1. Reveals — `.fade-up` (legacy) and `.reveal` (transition-based) elements
 *     get `.visible` / `.is-visible` when they scroll into view.
 *  2. Stagger — direct `.reveal` children of a `[data-stagger]` container are
 *     auto-assigned an incremental `--reveal-delay`, so grids cascade without
 *     hand-numbering each cell.
 *  3. Parallax — `[data-parallax]` elements translate vertically as they pass
 *     through the viewport (strength via `data-parallax="0.15"`).
 *
 * Everything no-ops under prefers-reduced-motion. Re-runs on route change so
 * client-navigated pages animate too.
 */
export default function ScrollAnimations() {
  const pathname = usePathname();

  useEffect(() => {
    const reduced = window.matchMedia(REDUCED).matches;

    // 1 + 2. Assign stagger delays, then reveal on intersect.
    document.querySelectorAll<HTMLElement>("[data-stagger]").forEach((group) => {
      const step = Number(group.dataset.stagger) || 90;
      group
        .querySelectorAll<HTMLElement>(":scope > .reveal, :scope > .fade-up")
        .forEach((child, i) => {
          child.style.setProperty("--reveal-delay", `${i * step}ms`);
          child.style.animationDelay = `${i * step}ms`;
        });
    });

    const revealObserver = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("visible", "is-visible");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    document
      .querySelectorAll(".fade-up:not(.visible), .reveal:not(.is-visible)")
      .forEach((el) => revealObserver.observe(el));

    // 3. Parallax.
    const parallaxEls = Array.from(
      document.querySelectorAll<HTMLElement>("[data-parallax]")
    );
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const vh = window.innerHeight;
        for (const el of parallaxEls) {
          const strength = Number(el.dataset.parallax) || 0.15;
          const rect = el.getBoundingClientRect();
          // Progress from -1 (below viewport) to 1 (above), 0 at center.
          const progress = (rect.top + rect.height / 2 - vh / 2) / vh;
          el.style.transform = `translate3d(0, ${(progress * strength * 100).toFixed(2)}px, 0)`;
        }
      });
    };

    if (!reduced && parallaxEls.length) {
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
    }

    return () => {
      revealObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return null;
}
