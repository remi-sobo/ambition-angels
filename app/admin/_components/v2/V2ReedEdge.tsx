"use client";

import { useReedLauncher } from "../reed/ReedLauncherProvider";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Spec B, stage B3 — Reed's V2 launcher: a collapsed right-edge tab that
 * opens the existing Reed panel (one Reed UI regardless of entry, via
 * ReedLauncherProvider). Availability = the ai.reed entitlement, resolved
 * server-side in the layout (DoD 6: absent for orgs without the key —
 * Young Life EPA and SafeSpace).
 *
 * Hidden below lg (1024px) so it can never collide with the mobile bar; the
 * panel itself is the provider's existing drawer. The layout pairs this with
 * a 52px right gutter on the content column at xl.
 */
export default function V2ReedEdge() {
  const reed = useReedLauncher();
  if (!reed.enabled) return null;
  return (
    <button
      type="button"
      onClick={() => reed.open({ surface: "v2-edge" })}
      aria-label="Open Reed"
      className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 flex-col items-center gap-1.5 rounded-l-xl border border-r-0 border-white/10 bg-[#23160D] px-2 py-4 text-cream/80 shadow-lg transition-colors hover:text-cream hover:bg-[#2d1d10]"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4 text-[#F47840]"
        aria-hidden
      >
        <path d="M12 4l1.6 4.9 4.9 1.6-4.9 1.6L12 17l-1.6-4.9L5.5 10.5l4.9-1.6L12 4z" />
      </svg>
      <span
        className={`${TYPE.sectionHeader} !text-current`}
        style={{ writingMode: "vertical-rl" }}
      >
        Reed
      </span>
    </button>
  );
}
