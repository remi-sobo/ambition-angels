"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TodayObligation } from "@/lib/admin/today";
import { SHOW_CAP } from "@/lib/admin/todayRank";

/**
 * Spec Home, stage H1 — the Needs-you feed. At most SHOW_CAP rows, ranked
 * server-side; "Show all N" expands in place (open decision 1, resolved —
 * /admin/queue's 308 lands here at cutover, not on a new screen). Every row
 * carries its why-line — never a bare checkbox — and resolve/snooze go
 * through the A3 RPCs (the API route re-implements no permission logic).
 */
export default function NeedsYou({
  obligations,
  today,
}: {
  obligations: TodayObligation[];
  today: string;
}) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = showAll ? obligations : obligations.slice(0, SHOW_CAP);
  const hidden = obligations.length - SHOW_CAP;

  async function act(row: TodayObligation, action: "resolve" | "snooze", until?: string) {
    setBusyId(row.id);
    setError(null);
    try {
      const r = await fetch("/api/admin/obligations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, source: row.type, sourceId: row.source_id, until }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        setError(j?.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  if (obligations.length === 0) {
    return <p className="text-[13px] text-ink-2">Nothing needs you right now. Enjoy it.</p>;
  }

  return (
    <div>
      {error && <p className="mb-2 text-[12px] text-red-700">{error}</p>}
      <ul className="divide-y divide-outline/60">
        {visible.map((row) => {
          const overdue = Boolean(row.due_date && row.due_date < today);
          return (
            <li key={row.id} className="flex items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={row.href}
                    className="truncate text-[13px] font-heading font-semibold text-ink-1 hover:text-orange"
                  >
                    {row.title}
                  </Link>
                  {row.due_date && (
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-heading font-semibold uppercase tracking-wide ${
                        overdue
                          ? "bg-red-50 text-red-700"
                          : row.due_date === today
                            ? "bg-orange-light text-orange-dark"
                            : "bg-gray-light text-ink-2"
                      }`}
                    >
                      {overdue ? `overdue · ${row.due_date}` : row.due_date === today ? "today" : row.due_date}
                    </span>
                  )}
                </div>
                <p className={`mt-0.5 text-[12px] ${row.whyRecorded ? "text-ink-2" : "text-ink-3 italic"}`}>
                  {row.why}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {row.snoozable && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => act(row, "snooze", overdue || row.due_date === today ? tomorrow : nextWeek)}
                    title={`Snooze until ${overdue || row.due_date === today ? tomorrow : nextWeek}`}
                    className="rounded-lg border border-outline px-2 py-1 text-[11px] text-ink-2 transition-colors hover:bg-gray-light disabled:opacity-50"
                  >
                    Snooze
                  </button>
                )}
                {row.resolvable && (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => act(row, "resolve")}
                    title="Mark done"
                    className="rounded-lg border border-outline px-2 py-1 text-[11px] font-medium text-revenue transition-colors hover:bg-revenue-bg disabled:opacity-50"
                  >
                    {busyId === row.id ? "…" : "Done"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-[12px] font-medium text-orange hover:text-orange-dark"
        >
          {showAll ? `Show top ${SHOW_CAP}` : `Show all ${obligations.length}`}
        </button>
      )}
    </div>
  );
}
