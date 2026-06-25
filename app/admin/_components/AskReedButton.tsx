"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * "Ask Reed" — the global entry point to the BloomOS assistant. Lives in the
 * admin layout (Reed Phase 3), mounted only when the org holds the `ai.reed`
 * entitlement, so Bloom-base tenants never see it. This is the SHELL: it gives
 * Reed a face and unifies the existing AI features under his name. The
 * conversational Ask surface is wired in Phase 4 (the /api/reed/ask orchestrator)
 * — until then the ask bar is intentionally inert and labelled as such, so the
 * panel never implies intelligence that isn't there yet.
 *
 * Sits to the left of the QuickAdd "+" FAB so the two don't collide.
 */

type ReedJob = { label: string; blurb: string; href: string };

// Reed's existing capabilities, "pre-aimed at one job." These are the AI
// features that already exist, now surfaced under Reed's name.
const REED_JOBS: ReedJob[] = [
  { label: "Morning brief", blurb: "Reed's read on what matters today", href: "/admin/briefing" },
  { label: "Funder research", blurb: "Deep-research a prospect into a brief", href: "/admin/fundraising/prospects" },
  { label: "Next best action", blurb: "Who to move, and how, this week", href: "/admin/fundraising" },
];

export default function AskReedButton() {
  const [open, setOpen] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const fabOffset = {
    right: "max(calc(1.5rem + 4rem), calc(env(safe-area-inset-right) + 4rem))",
    bottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))",
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask Reed"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed z-40 w-14 h-14 rounded-full bg-navy hover:bg-[#19305f] text-white shadow-2xl shadow-navy/30 flex items-center justify-center transition-transform active:scale-95"
        style={fabOffset}
      >
        <ReedMark className="w-6 h-6 text-orange-mid" />
      </button>

      {open && <ReedPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function ReedPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Reed">
      {/* scrim */}
      <button aria-label="Close Reed" onClick={onClose} className="absolute inset-0 bg-ink/50 cursor-default" />

      <aside className="relative z-10 flex h-full w-full max-w-sm flex-col bg-ink text-ink-1 shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy">
              <ReedMark className="w-4 h-4 text-orange-mid" />
            </span>
            <div className="leading-tight">
              <div className="font-heading font-bold text-cream">Reed</div>
              <div className="text-[11px] text-ink-3">Your BloomOS assistant</div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-cream transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <p className="text-sm text-ink-2 leading-relaxed">
            Reed reasons across your BloomOS data — fundraising, finance, program, ops. Full
            conversational Ask is coming next. For now, here&apos;s what Reed already does, each
            pre-aimed at one job:
          </p>

          <div className="mt-4 flex flex-col gap-2">
            {REED_JOBS.map((job) => (
              <Link
                key={job.href}
                href={job.href}
                onClick={onClose}
                className="group rounded-card border border-white/10 bg-surface/40 px-4 py-3 transition-colors hover:border-orange/40 hover:bg-surface/70"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading font-semibold text-cream text-sm">{job.label}</span>
                  <span className="text-ink-3 group-hover:text-orange transition-colors">→</span>
                </div>
                <span className="text-[12px] text-ink-3">{job.blurb}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* inert ask bar — Phase 4 wires this to /api/reed/ask */}
        <div className="border-t border-white/10 px-5 py-4">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-surface/40 px-4 py-2.5 opacity-60">
            <ReedMark className="w-4 h-4 text-ink-3 shrink-0" />
            <input
              disabled
              placeholder="Ask Reed anything…"
              className="flex-1 bg-transparent text-sm text-ink-2 placeholder:text-ink-3 outline-none disabled:cursor-not-allowed"
            />
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-3">Conversational Ask arrives soon</p>
        </div>
      </aside>
    </div>
  );
}

/** Reed's mark — a four-point sparkle, the AI glyph used across his surfaces. */
function ReedMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7z" />
    </svg>
  );
}
