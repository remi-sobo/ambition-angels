"use client";

// Client pieces of the compliance calendar: item rows with status actions
// (start / mark filed / waive / delete) and the new-item form. Marking a
// recurring item filed rolls its due date forward server-side.

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ComplianceItem = {
  id: string;
  kind: string;
  title: string;
  jurisdiction: string | null;
  due_date: string;
  recur: string;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  last_filed_at: string | null;
};

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

const KIND_LABELS: Record<string, string> = {
  form_990: "IRS 990",
  state_charitable: "Charitable reg.",
  corporate_report: "Corporate",
  employment_tax: "Payroll tax",
  insurance: "Insurance",
  policy: "Policy",
  public_disclosure: "Disclosure",
  contract: "Contract",
  custom: "Custom",
};

export function ComplianceRow({ item }: { item: ComplianceItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/compliance/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete “${item.title}”?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/compliance/${item.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const overdue =
    item.due_date < new Date().toISOString().slice(0, 10) &&
    (item.status === "upcoming" || item.status === "in_progress");
  const openItem = item.status === "upcoming" || item.status === "in_progress";

  return (
    <article
      className={`bg-surface border rounded-xl p-3 text-sm ${
        overdue ? "border-expense/30" : "border-outline"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tile text-ink-2 uppercase tracking-wider">
          {KIND_LABELS[item.kind] ?? item.kind}
        </span>
        <span className="font-semibold text-ink-1">{item.title}</span>
        {item.jurisdiction && item.jurisdiction !== "—" && (
          <span className="text-[11px] text-ink-2">{item.jurisdiction}</span>
        )}
        <span
          className={`ml-auto text-[12px] tabular-nums ${
            overdue ? "text-expense font-semibold" : "text-ink-1"
          }`}
        >
          {item.due_date}
          {item.recur !== "none" && (
            <span className="text-ink-2"> · {item.recur}</span>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-2">
        {item.status === "upcoming" && openItem && (
          <button
            onClick={() => patch({ status: "in_progress" })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2"
          >
            Start
          </button>
        )}
        {item.status === "in_progress" && (
          <span className="px-2 py-1 text-[11px] text-[#A56A1B]">In progress</span>
        )}
        {openItem && (
          <button
            onClick={() => patch({ status: "filed" })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-orange/15 text-orange hover:bg-orange/25"
          >
            Mark filed{item.recur !== "none" ? " → rolls forward" : ""}
          </button>
        )}
        {openItem && (
          <button
            onClick={() => patch({ status: "waived" })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] text-ink-2 hover:text-ink-1"
          >
            Waive
          </button>
        )}
        {!openItem && (
          <button
            onClick={() => patch({ status: "upcoming" })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2"
          >
            Reopen
          </button>
        )}
        {item.notes && (
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="px-2 py-1 rounded-md text-[11px] text-ink-2 hover:text-ink-1"
          >
            {showNotes ? "Hide notes" : "Notes"}
          </button>
        )}
        <button
          onClick={() => void remove()}
          disabled={busy}
          className="ml-auto px-2 py-1 rounded-md text-[11px] text-ink-2 hover:text-expense"
        >
          Delete
        </button>
      </div>
      {showNotes && item.notes && (
        <p className="mt-2 text-[12px] text-ink-2 leading-relaxed border-t border-outline pt-2">
          {item.notes}
          {item.last_filed_at && (
            <span className="block mt-1">Last filed {item.last_filed_at.slice(0, 10)}.</span>
          )}
        </p>
      )}
    </article>
  );
}

export function NewComplianceForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("custom");
  const [dueDate, setDueDate] = useState("");
  const [recur, setRecur] = useState("annual");
  const [jurisdiction, setJurisdiction] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          kind,
          due_date: dueDate,
          recur,
          jurisdiction: jurisdiction || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setTitle(""); setDueDate(""); setJurisdiction("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create item");
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
        + New deadline
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-full bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-4 grid grid-cols-2 lg:grid-cols-5 gap-3 items-end"
    >
      <label className="col-span-2 text-xs text-ink-2">
        Title
        <input className={`${inputCls} w-full mt-1`} value={title} required autoFocus
          placeholder="Workers' comp premium audit" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Type
        <select className={`${inputCls} w-full mt-1`} value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(KIND_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink-2">
        Due
        <input className={`${inputCls} w-full mt-1`} type="date" value={dueDate} required
          onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Repeats
        <select className={`${inputCls} w-full mt-1`} value={recur} onChange={(e) => setRecur(e.target.value)}>
          <option value="annual">Annually</option>
          <option value="quarterly">Quarterly</option>
          <option value="biennial">Every 2 years</option>
          <option value="none">One-time</option>
        </select>
      </label>
      <label className="text-xs text-ink-2">
        Jurisdiction
        <input className={`${inputCls} w-full mt-1`} value={jurisdiction} placeholder="IRS / CA / —"
          onChange={(e) => setJurisdiction(e.target.value)} />
      </label>
      <div className="col-span-full flex gap-2">
        <button type="submit" disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-ink-2 hover:text-ink-1 px-2">
          Cancel
        </button>
        {error && <p className="text-expense text-xs self-center">{error}</p>}
      </div>
    </form>
  );
}
