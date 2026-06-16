"use client";

// Client controls for recurring plans (Epic G): record a manual plan and
// pause / resume / cancel existing ones.

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
const labelCls = "flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold";

const FREQS = [
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["annually", "Annually"],
  ["weekly", "Weekly"],
] as const;

export function NewRecurringForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [donor, setDonor] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constituent_name: donor, amount: amount ? Number(amount) : undefined, frequency }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (j.warning) alert(j.warning);
      setDonor(""); setAmount("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create plan");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
      >
        + Manual plan
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4 flex flex-wrap items-end gap-3 w-full">
      <label className={labelCls}>
        Donor *
        <input required value={donor} onChange={(e) => setDonor(e.target.value)} placeholder="Name" className={inputCls + " w-48"} />
      </label>
      <label className={labelCls}>
        Amount ($) *
        <input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls + " w-28"} />
      </label>
      <label className={labelCls}>
        Frequency
        <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputCls}>
          {FREQS.map(([v, l]) => (<option key={v} value={v} className="bg-tile shadow-tile">{l}</option>))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Add plan"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs w-full">{error}</p>}
    </form>
  );
}

export function RecurringActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const patch = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/recurring/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex items-center gap-3">
      {status === "active" && (
        <button disabled={busy} onClick={() => patch({ status: "paused" })} className="text-[11px] font-semibold text-ink-3 hover:text-ink-1 transition-colors disabled:opacity-50">
          Pause
        </button>
      )}
      {status === "paused" && (
        <button disabled={busy} onClick={() => patch({ status: "active" })} className="text-[11px] font-semibold text-revenue hover:text-revenue transition-colors disabled:opacity-50">
          Resume
        </button>
      )}
      {status !== "cancelled" && (
        <button
          disabled={busy}
          onClick={() => { if (confirm("Cancel this recurring plan?")) void patch({ status: "cancelled" }); }}
          className="text-[11px] font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      )}
    </span>
  );
}
