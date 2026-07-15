"use client";

import Link from "next/link";
import { useState } from "react";
import type { Readiness, ReadinessCheck } from "@/lib/admin/strategy/readiness";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Funder-readiness summary (B2-5): a score, the open blockers, and the
 * advisories, each linking to where it's fixed. Collapsed by default to a
 * one-line status; expands to the full checklist.
 */
function Row({ c }: { c: ReadinessCheck }) {
  return (
    <li className="flex items-start gap-2 py-1.5 border-b border-hairline last:border-0">
      <span className={`mt-0.5 text-[12px] ${c.ok ? "text-revenue" : c.severity === "blocker" ? "text-expense" : "text-status-watch-text"}`}>
        {c.ok ? "✓" : c.severity === "blocker" ? "●" : "○"}
      </span>
      <span className="flex-1 min-w-0">
        <span className="text-[13px] text-ink-1">{c.label}</span>
        <span className="block text-[11px] text-ink-3 leading-snug">{c.detail}</span>
      </span>
      {!c.ok && c.fixHref && (
        <Link href={c.fixHref} className="shrink-0 text-[11px] font-semibold text-orange hover:underline">Fix →</Link>
      )}
    </li>
  );
}

export default function ReadinessPanel({ data }: { data: Readiness }) {
  const [open, setOpen] = useState(data.blockerCount > 0);
  const clean = data.blockerCount === 0;
  const openAdvisories = data.advisories.filter((a) => !a.ok).length;

  return (
    <section className={`mb-8 rounded-card border-[1.5px] p-5 ${clean ? "border-revenue/30 bg-revenue-bg" : "border-expense/30 bg-expense-bg"}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <div className={TYPE.cardLabel}>Funder readiness</div>
          <div className="font-heading font-bold text-ink-1 text-lg leading-tight">
            {clean ? "Ready to present" : `${data.blockerCount} blocker${data.blockerCount === 1 ? "" : "s"} to clear`}
            {openAdvisories > 0 && <span className="text-ink-3 font-normal text-sm"> · {openAdvisories} advisor{openAdvisories === 1 ? "y" : "ies"}</span>}
          </div>
        </div>
        <span className="ml-auto text-sm tabular-nums text-ink-2">{data.score.passed}/{data.score.total} checks</span>
        <button onClick={() => setOpen((v) => !v)} className="text-[11px] font-semibold text-ink-2 hover:text-orange">
          {open ? "Hide" : "Show"} checklist
        </button>
      </div>
      {open && (
        <ul className="mt-3">
          {[...data.blockers, ...data.advisories].map((c) => <Row key={c.id} c={c} />)}
        </ul>
      )}
    </section>
  );
}
