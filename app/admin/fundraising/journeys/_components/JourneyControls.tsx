"use client";

// Client controls for journeys (Epic J): build a triggered email sequence and
// pause / resume / delete it.

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
const labelCls = "flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold";

const TRIGGERS = [
  ["first_gift", "First gift → welcome series"],
  ["lapsed", "Lapsed (LYBUNT / off-cadence) → re-engage"],
  ["manual", "Manual (no auto-enroll)"],
] as const;

type Step = { subject: string; body: string; delay_days: number };

export function NewJourneyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("first_gift");
  const [steps, setSteps] = useState<Step[]>([{ subject: "", body: "", delay_days: 0 }]);

  const setStep = (i: number, patch: Partial<Step>) =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  const addStep = () => setSteps((s) => [...s, { subject: "", body: "", delay_days: 7 }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/journeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, trigger, steps }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (j.warning) alert(j.warning);
      router.refresh();
      setOpen(false);
      setName(""); setTrigger("first_gift"); setSteps([{ subject: "", body: "", delay_days: 0 }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create journey");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors">
        + New journey
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4 space-y-4 w-full">
      <div className="flex flex-wrap gap-3">
        <label className={labelCls + " flex-1 min-w-[12rem]"}>
          Journey name *
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="New-donor welcome" className={inputCls + " w-full"} />
        </label>
        <label className={labelCls}>
          Trigger
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className={inputCls + " w-72"}>
            {TRIGGERS.map(([v, l]) => (<option key={v} value={v} className="bg-tile shadow-tile">{l}</option>))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        {steps.map((st, i) => (
          <div key={i} className="border-[1.5px] border-outline rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Step {i + 1}</span>
              <label className="text-[11px] text-ink-3 flex items-center gap-1.5">
                wait
                <input type="number" min="0" value={st.delay_days} onChange={(e) => setStep(i, { delay_days: Number(e.target.value) })} className={inputCls + " w-16 py-1"} />
                days {i === 0 ? "after enrollment" : "after previous"}
                {steps.length > 1 && (
                  <button type="button" onClick={() => removeStep(i)} className="ml-2 text-ink-3 hover:text-expense">✕</button>
                )}
              </label>
            </div>
            <input value={st.subject} onChange={(e) => setStep(i, { subject: e.target.value })} placeholder="Subject" className={inputCls + " w-full"} />
            <textarea value={st.body} onChange={(e) => setStep(i, { body: e.target.value })} rows={4} placeholder={"Hi {{first_name}},\n\n…"} className={inputCls + " w-full resize-y"} />
          </div>
        ))}
        <button type="button" onClick={addStep} className="text-[11px] font-semibold text-orange hover:text-orange-dark transition-colors">+ Add step</button>
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Create journey"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs">{error}</p>}
    </form>
  );
}

export function JourneyActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<Response>) => {
    setBusy(true);
    try { await fn(); router.refresh(); } finally { setBusy(false); }
  };
  return (
    <span className="flex items-center gap-3">
      <button
        disabled={busy}
        onClick={() => act(() => fetch(`/api/admin/journeys/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: status === "active" ? "paused" : "active" }) }))}
        className="text-[11px] font-semibold text-ink-2 hover:text-ink-1 transition-colors disabled:opacity-50"
      >
        {status === "active" ? "Pause" : "Resume"}
      </button>
      <button
        disabled={busy}
        onClick={() => { if (confirm("Delete this journey? Enrollments are removed.")) void act(() => fetch(`/api/admin/journeys/${id}`, { method: "DELETE" })); }}
        className="text-[11px] font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
      >
        Delete
      </button>
    </span>
  );
}
