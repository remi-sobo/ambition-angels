"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusChip } from "../../_components/StatusChip";
import { SEVERITY_STATUS, SEVERITY_LABEL, type BriefingItem } from "@/lib/admin/briefing/types";

// One briefing item: severity chip + title + the why (with a number) + the
// decisions. Decisions write to bloomos_briefing_state only and are reversible
// — acting on an item optimistically collapses it to an Undo row.
const DECISION_LABEL: Record<string, string> = {
  mark_done: "Done",
  snooze: "Snooze",
  dismiss: "Dismiss",
};
const RESOLVED_LABEL: Record<string, string> = {
  mark_done: "Marked done",
  snooze: "Snoozed",
  dismiss: "Dismissed",
};

export default function BriefingCard({ item }: { item: BriefingItem }) {
  const router = useRouter();
  const [resolved, setResolved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision: string) {
    setBusy(true);
    try {
      await fetch("/api/admin/briefing/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, decision }),
      });
      setResolved(decision);
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    try {
      await fetch("/api/admin/briefing/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, decision: "undo" }),
      });
      setResolved(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (resolved) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border-[1.5px] border-outline bg-tile px-4 py-3 text-sm text-ink-2">
        <span>
          {RESOLVED_LABEL[resolved] ?? "Done"} · <span className="text-ink-1 font-medium">{item.title}</span>
        </span>
        <button
          onClick={undo}
          disabled={busy}
          className="text-xs font-semibold text-orange hover:text-orange-dark disabled:opacity-50"
        >
          Undo
        </button>
      </div>
    );
  }

  const actionable = item.decisions.filter((d) => d !== "open");

  return (
    <div className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <StatusChip status={SEVERITY_STATUS[item.severity]}>
              {SEVERITY_LABEL[item.severity]}
            </StatusChip>
            {item.metric && (
              <span className="text-[11px] font-mono tabular-nums text-ink-2">{item.metric}</span>
            )}
          </div>
          <h3 className="font-heading font-semibold text-[15px] text-ink-1 leading-snug">
            {item.title}
          </h3>
          <p className="text-sm text-ink-2 mt-0.5">{item.detail}</p>
          {item.staleFlag && (
            <p className="text-[11px] text-status-watch-text mt-1.5">
              ⚠ Computed off {item.dataAgeDays ?? "?"}-day-old data — re-sync to confirm.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        {item.decisions.includes("open") && (
          <Link
            href={item.deepLink}
            className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors"
          >
            Open
          </Link>
        )}
        {actionable.map((d) => (
          <button
            key={d}
            onClick={() => decide(d)}
            disabled={busy}
            className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
          >
            {DECISION_LABEL[d] ?? d}
          </button>
        ))}
      </div>
    </div>
  );
}
