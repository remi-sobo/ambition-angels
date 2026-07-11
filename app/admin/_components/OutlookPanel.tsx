"use client";

import { useState } from "react";
import type { Outlook, OutlookWindow } from "@/lib/admin/outlook";
import ExplainWithReed from "./ExplainWithReed";

// The 30/60/90 outlook, rendered as three compact chips inside the status
// card — click a window to expand its detail (cash trajectory, inflows,
// what's due, metrics trending off-target). Expand-on-demand, never a wall
// of rows. All numbers are deterministic reads of canonical sources
// (lib/admin/outlook.ts); nothing here is narrated or guessed.

const LEVEL_DOT: Record<OutlookWindow["level"], string> = {
  critical: "bg-status-critical",
  watch: "bg-status-watch",
  steady: "bg-status-healthy",
};

const MODULE_LABEL: Record<string, string> = {
  ops: "Ops",
  fundraising: "Fundraising",
  compliance: "Compliance",
  finance: "Finance",
  program: "Program",
  board: "Board",
  documents: "Documents",
  metrics: "Metrics",
};

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function OutlookPanel({ outlook }: { outlook: Outlook }) {
  const [open, setOpen] = useState<30 | 60 | 90 | null>(null);
  const active = outlook.windows.find((w) => w.days === open) ?? null;

  return (
    <div className="mt-3 pl-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mr-1">
          Outlook
        </span>
        {outlook.windows.map((w) => (
          <button
            key={w.days}
            type="button"
            onClick={() => setOpen(open === w.days ? null : w.days)}
            aria-expanded={open === w.days}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
              open === w.days
                ? "border-orange bg-orange/10 text-ink-1"
                : "border-outline bg-tile text-ink-2 hover:text-ink-1"
            }`}
          >
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[w.level]}`} />
            {w.days}d
            {w.projectedCash !== null && <span className="tabular-nums">{usd(w.projectedCash)}</span>}
            <span className="text-ink-3 tabular-nums">· {w.dueTotal} due</span>
          </button>
        ))}
      </div>

      {active && (
        <div className="mt-2 rounded-card border-[1.5px] border-outline bg-tile px-4 py-3 text-xs text-ink-2 space-y-1.5">
          <p>
            <span className="font-semibold text-ink-1">Cash by {active.endDate}:</span>{" "}
            {active.projectedCash !== null ? (
              <>
                <span className="tabular-nums font-semibold text-ink-1">{usd(active.projectedCash)}</span>{" "}
                at current burn, counting {usd(active.committedInflows)} committed inflows
                {active.projectedInflows > 0 && (
                  <> (+{usd(active.projectedInflows)} projected, not counted)</>
                )}
                .
              </>
            ) : (
              "no burn baseline yet — projection unavailable."
            )}
          </p>
          <p>
            <span className="font-semibold text-ink-1">Due in the window:</span>{" "}
            {active.dueTotal === 0
              ? "nothing dated."
              : Object.entries(active.dueByModule)
                  .sort((a, b) => b[1] - a[1])
                  .map(([m, n]) => `${n} ${MODULE_LABEL[m] ?? m}`)
                  .join(" · ") + "."}
          </p>
          {active.metricsOffTrack.length > 0 && (
            <p>
              <span className="font-semibold text-ink-1">Trending off-target:</span>{" "}
              {active.metricsOffTrack
                .slice(0, 4)
                .map((m) => `${m.name} (${m.current} → ~${m.projected} vs ${m.target})`)
                .join(" · ")}
              {active.metricsOffTrack.length > 4 && ` +${active.metricsOffTrack.length - 4} more`}
            </p>
          )}
          <div className="pt-0.5">
            <ExplainWithReed
              surface="outlook"
              question={`What's driving the ${active.days}-day outlook (level: ${active.level}), and what should I act on first?`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
