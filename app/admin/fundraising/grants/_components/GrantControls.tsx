"use client";

// Client controls for the Grants module: create form, stage select,
// requirement actions. All call the admin APIs then router.refresh() so the
// server pages re-render with fresh data.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STAGES, STAGE_LABELS } from "../_lib/stages";


const KINDS = [
  ["application", "Application"],
  ["loi", "LOI"],
  ["interim_report", "Interim report"],
  ["final_report", "Final report"],
  ["financial_report", "Financial report"],
  ["other", "Other"],
] as const;

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

const KIND_LABELS: Record<string, string> = {
  loi: "LOI", application: "Application", interim_report: "Interim report",
  final_report: "Final report", financial_report: "Financial report", other: "Deadline",
};

const fmtReqDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function NewGrantForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [funder, setFunder] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

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
          period_end: periodEnd || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (j.warning) alert(j.warning);
      setName(""); setFunder(""); setAmount(""); setDeadline(""); setPeriodEnd("");
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
    <form onSubmit={submit} className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4 flex flex-wrap items-end gap-3 w-full">
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold">
        Grant name *
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Koshland 2026" className={inputCls + " w-52"} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold">
        Funder
        <input value={funder} onChange={(e) => setFunder(e.target.value)} placeholder="Foundation name" className={inputCls + " w-48"} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold">
        Ask ($)
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls + " w-28"} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold">
        First deadline
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls + " w-40"} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold">
        Period end
        <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputCls + " w-40"} />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Creating…" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs w-full">{error}</p>}
    </form>
  );
}

// ── Editable grant details ──────────────────────────────────────────────────
// The Details panel: read-only facts with an Edit toggle that opens a form
// covering every editable field (name, funder, amounts, period, program,
// restrictions, owner, notes). Saves via PATCH then refreshes the server page.

const fmtMoney = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(0)}k`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
};
const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export type GrantDetails = {
  id: string;
  name: string;
  funderName: string | null;
  amount_requested: number | null;
  amount_awarded: number | null;
  period_start: string | null;
  period_end: string | null;
  program: string | null;
  restrictions: string | null;
  owner: string | null;
  notes: string | null;
};

export function EditableGrantDetails({ grant }: { grant: GrantDetails }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(grant.name);
  const [funder, setFunder] = useState(grant.funderName ?? "");
  const [requested, setRequested] = useState(grant.amount_requested?.toString() ?? "");
  const [awarded, setAwarded] = useState(grant.amount_awarded?.toString() ?? "");
  const [periodStart, setPeriodStart] = useState(grant.period_start ?? "");
  const [periodEnd, setPeriodEnd] = useState(grant.period_end ?? "");
  const [program, setProgram] = useState(grant.program ?? "");
  const [restrictions, setRestrictions] = useState(grant.restrictions ?? "");
  const [owner, setOwner] = useState(grant.owner ?? "");
  const [notes, setNotes] = useState(grant.notes ?? "");

  const startEdit = () => {
    setName(grant.name);
    setFunder(grant.funderName ?? "");
    setRequested(grant.amount_requested?.toString() ?? "");
    setAwarded(grant.amount_awarded?.toString() ?? "");
    setPeriodStart(grant.period_start ?? "");
    setPeriodEnd(grant.period_end ?? "");
    setProgram(grant.program ?? "");
    setRestrictions(grant.restrictions ?? "");
    setOwner(grant.owner ?? "");
    setNotes(grant.notes ?? "");
    setError("");
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Grant name is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/grants/${grant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          funder_name: funder.trim(),
          amount_requested: requested.trim() === "" ? null : Number(requested),
          amount_awarded: awarded.trim() === "" ? null : Number(awarded),
          period_start: periodStart || null,
          period_end: periodEnd || null,
          program: program.trim() || null,
          restrictions: restrictions.trim() || null,
          owner: owner.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save grant");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    const facts: Array<[string, string]> = [
      ["Funder", grant.funderName ?? "—"],
      ["Requested", grant.amount_requested != null ? fmtMoney(grant.amount_requested) : "—"],
      ["Awarded", grant.amount_awarded != null ? fmtMoney(grant.amount_awarded) : "—"],
      ["Period", grant.period_start || grant.period_end
        ? `${grant.period_start ? fmtDay(grant.period_start) : "…"} → ${grant.period_end ? fmtDay(grant.period_end) : "…"}`
        : "—"],
      ["Program", grant.program ?? "—"],
      ["Restrictions", grant.restrictions ?? "Unrestricted (none recorded)"],
      ["Owner", grant.owner ?? "—"],
    ];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-ink-1 text-sm">Details</h2>
          <button
            onClick={startEdit}
            className="text-[11px] font-semibold text-orange hover:text-orange-dark transition-colors"
          >
            Edit
          </button>
        </div>
        {facts.map(([label, value]) => (
          <div key={label} className="flex gap-3 text-xs">
            <span className="text-ink-3 w-24 flex-shrink-0 uppercase tracking-wider font-semibold pt-px">{label}</span>
            <span className="text-ink-1 break-words min-w-0">{value}</span>
          </div>
        ))}
        {grant.notes && <p className="text-xs text-ink-2 border-t border-outline pt-3 whitespace-pre-wrap">{grant.notes}</p>}
      </div>
    );
  }

  const fieldLabel = "flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold";
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-bold text-ink-1 text-sm">Edit details</h2>
      </div>
      <label className={fieldLabel}>
        Grant name *
        <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </label>
      <label className={fieldLabel}>
        Funder
        <input value={funder} onChange={(e) => setFunder(e.target.value)} placeholder="Foundation name" className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={fieldLabel}>
          Requested ($)
          <input type="number" min="0" step="0.01" value={requested} onChange={(e) => setRequested(e.target.value)} className={inputCls} />
        </label>
        <label className={fieldLabel}>
          Awarded ($)
          <input type="number" min="0" step="0.01" value={awarded} onChange={(e) => setAwarded(e.target.value)} className={inputCls} />
        </label>
        <label className={fieldLabel}>
          Period start
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={inputCls} />
        </label>
        <label className={fieldLabel}>
          Period end
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className={fieldLabel}>
        Program
        <input value={program} onChange={(e) => setProgram(e.target.value)} className={inputCls} />
      </label>
      <label className={fieldLabel}>
        Owner
        <input value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls} />
      </label>
      <label className={fieldLabel}>
        Restrictions
        <textarea value={restrictions} onChange={(e) => setRestrictions(e.target.value)} rows={2} className={inputCls + " resize-y"} />
      </label>
      <label className={fieldLabel}>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls + " resize-y"} />
      </label>
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs">{error}</p>}
    </form>
  );
}

export function StageSelect({
  grantId,
  stage,
  periodEnd,
}: {
  grantId: string;
  stage: string;
  periodEnd: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Advancing to "awarded" without a grant period on file: collect the
  // period end inline so the final report can auto-plot (skippable).
  const [pendingAward, setPendingAward] = useState(false);
  const [awardPeriodEnd, setAwardPeriodEnd] = useState("");

  const patch = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/grants/${grantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.refresh();
    } finally {
      setBusy(false);
      setPendingAward(false);
      setAwardPeriodEnd("");
    }
  };

  if (pendingAward) {
    return (
      <span className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-ink-2">Grant period end (plots the final report):</span>
        <input
          type="date"
          value={awardPeriodEnd}
          onChange={(e) => setAwardPeriodEnd(e.target.value)}
          className="bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1 text-ink-1 text-xs focus:outline-none focus:border-orange/40"
        />
        <button
          disabled={busy}
          onClick={() =>
            void patch(
              awardPeriodEnd
                ? { stage: "awarded", period_end: awardPeriodEnd }
                : { stage: "awarded" }
            )
          }
          className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
        >
          {busy ? "Saving…" : "Mark awarded"}
        </button>
        <button
          disabled={busy}
          onClick={() => setPendingAward(false)}
          className="text-[11px] font-semibold text-ink-2 hover:text-ink-1 transition-colors"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <select
      value={stage}
      disabled={busy}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "awarded" && !periodEnd) {
          setPendingAward(true);
          return;
        }
        void patch({ stage: next });
      }}
      className="bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1.5 text-ink-1 text-xs focus:outline-none focus:border-orange/40 disabled:opacity-50"
    >
      {STAGES.map((s) => (
        <option key={s} value={s} className="bg-tile shadow-tile">
          {STAGE_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

type Requirement = {
  id: string;
  kind: string;
  label: string | null;
  due_date: string;
  status: string;
  submitted_at: string | null;
  notes: string | null;
};

// One requirement-calendar row: read view + inline edit (kind / due date /
// label) + the status actions. Replaces the old display-only row so deadlines
// can be corrected in place instead of deleted and recreated.
export function RequirementRow({ requirement: r, today }: { requirement: Requirement; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState(r.kind);
  const [due, setDue] = useState(r.due_date);
  const [label, setLabel] = useState(r.label ?? "");

  const open = r.status === "upcoming" || r.status === "in_progress";
  const isOverdue = open && r.due_date < today;

  const act = async (fn: () => Promise<Response>) => {
    setBusy(true);
    try { await fn(); router.refresh(); } finally { setBusy(false); }
  };

  const startEdit = () => {
    setKind(r.kind);
    setDue(r.due_date);
    setLabel(r.label ?? "");
    setError("");
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!due) {
      setError("A due date is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/grants/requirements/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, due_date: due, label: label.trim() || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <li className="px-5 py-3">
        <form onSubmit={save} className="flex flex-wrap items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls + " text-xs"}>
            {KINDS.map(([v, l]) => (
              <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
            ))}
          </select>
          <input type="date" required value={due} onChange={(e) => setDue(e.target.value)} className={inputCls + " text-xs"} />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className={inputCls + " text-xs w-44"} />
          <button type="submit" disabled={busy} className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-2.5 py-1 rounded-full transition-colors disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-[11px] font-semibold text-ink-2 hover:text-ink-1 transition-colors">
            Cancel
          </button>
          {error && <p className="text-expense text-[11px] w-full">{error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="px-5 py-3 flex items-center gap-3">
      <span
        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
          isOverdue ? "bg-expense-bg text-expense" : open ? "bg-tile text-ink-2" : "bg-revenue-bg text-revenue"
        }`}
      >
        {fmtReqDate(r.due_date)}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium truncate ${open ? "text-ink-1" : "text-ink-3 line-through"}`}>
          {r.label || KIND_LABELS[r.kind] || r.kind}
        </div>
        {r.notes && <div className="text-[11px] text-ink-2 truncate">{r.notes}</div>}
      </div>
      {r.status === "submitted" && r.submitted_at && (
        <span className="text-[11px] text-revenue whitespace-nowrap">
          Submitted {new Date(r.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}
      {r.status === "waived" && <span className="text-[11px] text-ink-3">Waived</span>}
      <span className="flex items-center gap-2">
        <button
          disabled={busy}
          onClick={startEdit}
          className="text-[11px] font-semibold text-ink-3 hover:text-orange transition-colors disabled:opacity-50"
        >
          Edit
        </button>
        {open && r.status !== "submitted" && (
          <button
            disabled={busy}
            onClick={() =>
              act(() =>
                fetch(`/api/admin/grants/requirements/${r.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "submitted" }),
                })
              )
            }
            className="text-[11px] font-semibold text-revenue hover:text-revenue transition-colors disabled:opacity-50"
          >
            Mark submitted
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => {
            if (!confirm("Delete this deadline?")) return;
            void act(() => fetch(`/api/admin/grants/requirements/${r.id}`, { method: "DELETE" }));
          }}
          className="text-[11px] font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
        >
          Delete
        </button>
      </span>
    </li>
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
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-outline">
      <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls + " text-xs"}>
        {KINDS.map(([v, l]) => (
          <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
        ))}
      </select>
      <input type="date" required value={due} onChange={(e) => setDue(e.target.value)} className={inputCls + " text-xs"} />
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" className={inputCls + " text-xs w-44"} />
      <button type="submit" disabled={busy} className="text-xs font-semibold text-orange bg-orange/10 border border-orange/30 px-3 py-2 rounded-lg hover:bg-orange/20 transition-colors disabled:opacity-50">
        {busy ? "Adding…" : "+ Add deadline"}
      </button>
      {error && <p className="text-expense text-xs w-full">{error}</p>}
    </form>
  );
}
