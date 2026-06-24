"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Narrative } from "@/lib/admin/briefing/narrate";

// The hero of the morning brief: the AI-written synthesis, with a deterministic
// "if you do one thing" CTA derived from the top item. Regenerate forces a fresh
// read after you've acted on things.

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function NarrativeHero({ narrative }: { narrative: Narrative }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function regenerate() {
    setBusy(true);
    try {
      await fetch("/api/admin/briefing/narrative", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-6 sm:p-7 mb-6">
      {/* subtle brand dot texture, top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(to bottom left, black, transparent 60%)",
          WebkitMaskImage: "linear-gradient(to bottom left, black, transparent 60%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-orange">
            Morning Brief
          </span>
          <div className="flex items-center gap-3 text-[11px] text-ink-3">
            {narrative.generatedAt && <span>as of {timeLabel(narrative.generatedAt)}</span>}
            <button
              onClick={regenerate}
              disabled={busy}
              className="font-semibold text-ink-2 hover:text-orange transition-colors disabled:opacity-50"
            >
              {busy ? "Refreshing…" : "↻ Regenerate"}
            </button>
          </div>
        </div>

        <h2 className="font-heading font-bold text-ink-1 text-xl sm:text-2xl leading-tight">
          {narrative.headline}
        </h2>
        <p className="text-[15px] text-ink-2 leading-relaxed mt-2 max-w-[62ch]">
          {narrative.narrative}
        </p>

        {narrative.focus && (
          <div className="mt-5 flex items-start gap-3 rounded-card border-[1.5px] border-orange/25 bg-orange-light/60 px-4 py-3">
            <span className="text-[11px] font-heading font-bold uppercase tracking-wider text-orange-dark whitespace-nowrap mt-0.5">
              Do one thing
            </span>
            <span className="text-sm text-ink-1 font-medium flex-1 min-w-0">{narrative.focus}</span>
            {narrative.focusLink && (
              <Link
                href={narrative.focusLink}
                className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
              >
                Go →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
