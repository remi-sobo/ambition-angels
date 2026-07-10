"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Manual snapshot entry for a catalog metric. POSTs to the snapshot route,
// which writes metric_snapshots (captured_by = the caller's uuid) and syncs
// the plan-side KPI in the same request.
export default function MetricUpdateForm({ metricId }: { metricId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n) || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/metrics/${metricId}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: n, ...(note.trim() ? { note: note.trim() } : {}) }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(j.error || "Save failed");
      return;
    }
    setOpen(false);
    setValue("");
    setNote("");
    router.refresh();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold px-2.5 py-1 rounded-full border border-outline text-ink-2 hover:border-orange/40 hover:text-orange transition-colors whitespace-nowrap"
      >
        Update
      </button>
    );
  }

  return (
    <form onSubmit={save} className="flex items-center gap-1.5">
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Value"
        required
        autoFocus
        className="w-24 bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1 text-sm text-ink-1 focus:outline-none focus:border-orange/40"
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="w-32 bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1 text-sm text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/40"
      />
      <button
        type="submit"
        disabled={busy}
        className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange text-white hover:bg-orange-dark transition-colors disabled:opacity-50"
      >
        {busy ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs font-semibold text-ink-3 hover:text-ink-1"
      >
        ✕
      </button>
      {error && <span className="text-[11px] font-semibold text-expense">{error}</span>}
    </form>
  );
}
