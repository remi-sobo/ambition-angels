"use client";

// Presenter mode for the Strategy Narrative (spec Phase 5). A full-screen,
// chrome-free overlay Remi can run in a room: one movement per slide, large
// type, advanced by keyboard (← → / PageUp PageDown), Esc to exit. It sits at
// the top of the z-stack over the admin shell — same gated route, no chrome.
//
// Contrast guard (spec failure mode): cream app background with ink-1 text is
// high-contrast (AAA), so nothing reads cream-on-cream when projected.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export default function Presenter({ slides, titles }: { slides: ReactNode[]; titles: string[] }) {
  const router = useRouter();
  const n = slides.length;
  const [i, setI] = useState(0);

  const go = useCallback((d: number) => setI((p) => Math.max(0, Math.min(n - 1, p + d))), [n]);
  const exit = useCallback(() => router.push("/admin/strategic-plan/narrative"), [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Escape") {
        exit();
      } else if (e.key === "Home") {
        setI(0);
      } else if (e.key === "End") {
        setI(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, exit, n]);

  return (
    <div className="fixed inset-0 z-[100] bg-app overflow-y-auto flex flex-col">
      {/* Slide. Larger base type so it reads at arm's length. */}
      <div className="flex-1 w-full max-w-[1080px] mx-auto px-6 sm:px-12 lg:px-16 py-12 sm:py-16 text-[1.06rem] leading-relaxed">
        {slides[i]}
      </div>

      {/* Bottom control bar — sticky, always reachable. */}
      <div className="sticky bottom-0 border-t border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="max-w-[1080px] mx-auto px-6 sm:px-12 lg:px-16 py-3 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {titles.map((t, idx) => (
              <button
                key={t}
                onClick={() => setI(idx)}
                aria-label={`Go to movement ${idx + 1}: ${t}`}
                className={`h-2 rounded-full transition-all ${idx === i ? "w-7 bg-orange" : "w-2 bg-gray-mid hover:bg-ink-3"}`}
              />
            ))}
          </div>
          <span className="text-[12px] uppercase tracking-[0.14em] text-ink-3 hidden sm:inline">
            Movement {i + 1} of {n} · {titles[i]}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => go(-1)}
              disabled={i === 0}
              className="px-3 py-1.5 rounded-full text-sm font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <button
              onClick={() => go(1)}
              disabled={i === n - 1}
              className="px-4 py-1.5 rounded-full text-sm font-semibold text-white bg-orange hover:bg-orange-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
            <button
              onClick={exit}
              className="ml-1 px-3 py-1.5 rounded-full text-sm font-semibold text-ink-2 hover:text-orange"
              title="Exit presenter (Esc)"
            >
              ✕ Exit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
