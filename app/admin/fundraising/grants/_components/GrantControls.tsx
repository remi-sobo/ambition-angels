"use client";

// Client controls for the Grants module: create form, stage select,
// requirement actions. All call the admin APIs then router.refresh() so the
// server pages re-render with fresh data.

import { useState } from "react";
import { useRouter } from "next/navigation";

export const STAGES = [
  "prospect", "qualified", "loi", "proposal", "submitted",
  "awarded", "declined", "active", "closed",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  prospect: "Prospect", qualified: "Qualified", loi: "LOI",
  proposal: "Proposal", submitted: "Submitted", awarded: "Awarded",
  declined: "Declined", active: "Active", closed: "Closed",
};

const KINDS = [
  ["application", "Application"],
  ["loi", "LOI"],
  ["interim_report", "Interim report"],
  ["final_report", "Final report"],
  ["financial_report", "Financial report"],
  ["other", "Other"],
] as const;

const inputCls =
  "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream text-sm placeholder-gray-mid focus:outline-none focus:border-orange/40";

export function NewGrantForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [funder, setFunder] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          funder_name: funder || undefined,
          amount_requested: amount ? Number(amount) : undefined,
          first_deadline: deadline || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setName(""); setFunder(""); setAmount(""); setDeadline("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create grant");
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
        + New grant
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-4 flex flex-wrap items-end gap-3 w-full">
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-white/35 font-semibold">
        Grant name *
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Koshland 2026" className={inputCls + " w-52"} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-white/35 font-semibold">
        Funder
        <input value={funder} onChange={(e) => setFunder(e.target.value)} placeholder="Foundation name" className={inputCls + " w-48"} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-white/35 font-semibold">
        Ask ($)
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls + " w-28"} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-white/35 font-semibold">
        First deadline
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls + " w-40"} />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Creating…" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-gray-mid hover:text-cream px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-red-400 text-xs w-full">{error}</p>}
    </form>
  );
}

export function StageSelect({ grantId, stage }: { grantId: string; stage: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <select
      value={stage}
      disabled={busy}
      onChange={async (e) => {
        setBusy(true);
        try {
          await fetch(`/api/admin/grants/${grantId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage: e.target.value }),
          });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-cream text-xs focus:outline-none focus:border-orange/40 disabled:opacity-50"
    >
      {STAGES.map((s) => (
        <option key={s} value={s} className="bg-[#1a1d27]">
          {STAGE_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

export function RequirementActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<Response>) => {
    setBusy(true);
    try { await fn(); router.refresh(); } finally { setBusy(false); }
  };
  return (
    <span className="flex items-center gap-2">
      {status !== "submitted" && (
        <button
          disabled={busy}
          onClick={() =>
            act(() =>
              fetch(`/api/admin/grants/requirements/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "submitted" }),
              })
            )
          }
          className="text-[11px] font-semibold text-green-400 hover:text-green-300 transition-colors disabled:opacity-50"
        >
          Mark submitted
        </button>
      )}
      <button
        disabled={busy}
        onClick={() => {
          if (!confirm("Delete this deadline?")) return;
          void act(() => fetch(`/api/admin/grants/requirements/${id}`, { method: "DELETE" }));
        }}
        className="text-[11px] font-semibold text-white/30 hover:text-red-400 transition-colors disabled:opacity-50"
      >
        Delete
      </button>
    </span>
  );
}

export function AddRequirementForm({ grantId }: { grantId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<string>("application");
  const [due, setDue] = useState("");
  const [label, setLabel] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/grants/${grantId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, due_date: due, label: label || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setDue(""); setLabel("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add deadline");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-white/10">
      <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls + " text-xs"}>
        {KINDS.map(([v, l]) => (
          <option key={v} value={v} className="bg-[#1a1d27]">{l}</option>
        ))}
      </select>
      <input type="date" required value={due} onChange={(e) => setDue(e.target.value)} className={inputCls + " text-xs"} />
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className={inputCls + " text-xs w-44"} />
      <button type="submit" disabled={busy} className="text-xs font-semibold text-orange bg-orange/10 border border-orange/30 px-3 py-2 rounded-lg hover:bg-orange/20 transition-colors disabled:opacity-50">
        {busy ? "Adding…" : "+ Add deadline"}
      </button>
      {error && <p className="text-red-400 text-xs w-full">{error}</p>}
    </form>
  );
}
