"use client";

// Client pieces of the cohorts index: the new-cohort form.

import { useState } from "react";
import { useRouter } from "next/navigation";



const inputCls =
  "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream text-sm placeholder-gray-mid focus:outline-none focus:border-orange/40";

export function NewCohortForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [program, setProgram] = useState("");
  const [term, setTerm] = useState("");
  const [capacity, setCapacity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          program: program || undefined,
          term: term || undefined,
          capacity: capacity ? Number(capacity) : undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      setName(""); setProgram(""); setTerm(""); setCapacity(""); setStartDate(""); setEndDate("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors">
        + New cohort
      </button>
    );
  }

  return (
    <form onSubmit={submit}
      className="w-full bg-white/[0.03] border border-white/10 rounded-card p-4 grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
      <label className="text-xs text-gray-mid col-span-2 lg:col-span-1">
        Name
        <input className={`${inputCls} w-full mt-1`} value={name} required autoFocus
          placeholder="YGB Creators Camp 2027" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Program
        <input className={`${inputCls} w-full mt-1`} value={program}
          placeholder="YGB Creators Camp" onChange={(e) => setProgram(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Term
        <input className={`${inputCls} w-full mt-1`} value={term}
          placeholder="Summer 2027" onChange={(e) => setTerm(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Capacity
        <input className={`${inputCls} w-full mt-1`} value={capacity} type="number" min={1}
          placeholder="20" onChange={(e) => setCapacity(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Starts
        <input className={`${inputCls} w-full mt-1`} value={startDate} type="date"
          onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label className="text-xs text-gray-mid">
        Ends
        <input className={`${inputCls} w-full mt-1`} value={endDate} type="date"
          onChange={(e) => setEndDate(e.target.value)} />
      </label>
      <div className="col-span-full flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-gray-mid hover:text-cream px-2 py-2">
          Cancel
        </button>
        <button type="submit" disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Create cohort"}
        </button>
      </div>
    </form>
  );
}
