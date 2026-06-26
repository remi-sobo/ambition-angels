"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Step 5 of the Monday Plan: commit. Shows the week-ahead summary and writes the
 * rhythm_sessions row. Quiet saved tick, no celebration — you're taking the
 * wheel, not winning a prize. Re-committing is allowed (upsert); the button just
 * reflects the latest state.
 */
export default function MondayCommit({
  planned,
  placed,
  scheduled,
  committedAt,
}: {
  planned: number;
  placed: number;
  scheduled: number;
  committedAt: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(committedAt);

  async function commit() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/ops/rhythm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "monday_plan" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { session } = await r.json();
      setSavedAt(session?.completed_at ?? new Date().toISOString());
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Commit failed:", e);
      alert("Couldn't commit the week. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const savedLabel = savedAt
    ? new Date(savedAt).toLocaleString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6 space-y-4">
      <div>
        <h2 className="text-xs uppercase tracking-wider text-ink-2">Commit</h2>
        <p className="text-sm text-ink-2 mt-1">
          Here&apos;s the week you&apos;re taking on. Commit it to mark the plan done and record the
          run.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Planned" value={planned} />
        <Stat label="On a day" value={placed} />
        <Stat label="Time-blocked" value={scheduled} />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={commit}
          disabled={busy}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-orange text-white hover:bg-orange-dark disabled:opacity-50 transition-colors"
        >
          {busy ? "Saving…" : savedAt ? "Re-commit the week" : "Commit the week"}
        </button>
        {savedLabel && (
          <span className="text-sm text-revenue inline-flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Committed {savedLabel}
          </span>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border-[1.5px] border-outline bg-tile/40 px-3 py-3 text-center">
      <div className="font-display font-black text-2xl text-ink-1 leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mt-1">{label}</div>
    </div>
  );
}
