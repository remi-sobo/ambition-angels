"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * The last step of the Friday Close: close out. A short checklist + a note to
 * next week, then write the friday_close session (sets completed_at). Put the
 * week down — quiet tick, no celebration.
 */

const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "tasks_truthed", label: "Tasks truthed — done, rolled, or dropped" },
  { key: "follow_ups_cleared", label: "Meeting follow-ups cleared" },
  { key: "note_written", label: "Note to next week written" },
];

export default function FridayClose({
  committedAt,
  initialNotes,
  initialChecklist,
}: {
  committedAt: string | null;
  initialNotes: string;
  initialChecklist: Record<string, boolean>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(committedAt);
  const [notes, setNotes] = useState(initialNotes);
  const [checked, setChecked] = useState<Record<string, boolean>>(initialChecklist);

  function toggle(key: string) {
    setChecked((c) => ({ ...c, [key]: !c[key] }));
  }

  async function close() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/ops/rhythm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "friday_close", notes, checklist: checked }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { session } = await r.json();
      setSavedAt(session?.completed_at ?? new Date().toISOString());
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Close failed:", e);
      alert("Couldn't close the week. Try again.");
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
        <h2 className="text-xs uppercase tracking-wider text-ink-2">Close out</h2>
        <p className="text-sm text-ink-2 mt-1">Put the week down.</p>
      </div>

      <div className="space-y-2">
        {CHECKLIST_ITEMS.map((item) => (
          <label key={item.key} className="flex items-center gap-3 cursor-pointer select-none">
            <button
              type="button"
              onClick={() => toggle(item.key)}
              aria-pressed={!!checked[item.key]}
              className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                checked[item.key]
                  ? "bg-revenue-bg border-revenue/40 text-revenue"
                  : "border-outline hover:border-orange/60"
              }`}
            >
              {checked[item.key] && (
                <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <span className={`text-sm ${checked[item.key] ? "text-ink-1" : "text-ink-2"}`}>
              {item.label}
            </span>
          </label>
        ))}
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider text-ink-2 block mb-1">
          Note to next week
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What next-you should know walking into Monday…"
          className="w-full rounded-lg border-[1.5px] border-outline bg-surface p-3 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-orange/60"
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={close}
          disabled={busy}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-orange text-white hover:bg-orange-dark disabled:opacity-50 transition-colors"
        >
          {busy ? "Saving…" : savedAt ? "Update close-out" : "Close the week"}
        </button>
        {savedLabel && (
          <span className="text-sm text-revenue inline-flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Closed {savedLabel}
          </span>
        )}
      </div>
    </section>
  );
}
