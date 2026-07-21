"use client";

// Client pieces of the compliance item profile: status actions + core-field
// edit (shared vocabulary imported from the list controls), the notes/
// checklist panel, and the filings history panel — each past filing editable
// with confirmation number, fee, and notes, plus a manual backfill form.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";
import {
  KIND_LABELS,
  RECUR_OPTIONS,
  ASSIGNEE_OPTIONS,
  normalizeAssignee,
  type ComplianceItem,
  type ChecklistItem,
} from "../../_components/ComplianceControls";

export type ComplianceFiling = {
  id: string;
  filed_date: string;
  period_due_date: string | null;
  filed_by: string | null;
  confirmation: string | null;
  fee: number | string | null;
  notes: string | null;
};

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

async function patchItem(id: string, fields: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`/api/admin/compliance/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return (j.error as string) ?? `HTTP ${res.status}`;
  }
  return null;
}

export function ItemStatusActions({ item }: { item: ComplianceItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const openItem = item.status === "upcoming" || item.status === "in_progress";

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    const err = await patchItem(item.id, fields);
    setBusy(false);
    if (err) alert(err);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {item.status === "upcoming" && (
        <button onClick={() => void patch({ status: "in_progress" })} disabled={busy}
          className="px-3 py-1.5 rounded-full text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2">
          Start
        </button>
      )}
      {item.status === "in_progress" && (
        <span className="px-2 py-1 text-[11px] text-[#A56A1B]">In progress</span>
      )}
      {openItem && (
        <button onClick={() => void patch({ status: "filed" })} disabled={busy}
          className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-orange/15 text-orange hover:bg-orange/25">
          Mark filed{item.recur !== "none" ? " → rolls forward" : ""}
        </button>
      )}
      {openItem && (
        <button onClick={() => void patch({ status: "waived" })} disabled={busy}
          className="px-3 py-1.5 rounded-full text-[11px] text-ink-2 hover:text-ink-1">
          Waive
        </button>
      )}
      {!openItem && (
        <button onClick={() => void patch({ status: "upcoming" })} disabled={busy}
          className="px-3 py-1.5 rounded-full text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2">
          Reopen
        </button>
      )}
    </div>
  );
}

export function EditItemDetails({ item }: { item: ComplianceItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState(item.title);
  const [kind, setKind] = useState(item.kind);
  const [due, setDue] = useState(item.due_date);
  const [recur, setRecur] = useState(item.recur);
  const [jurisdiction, setJurisdiction] = useState(item.jurisdiction ?? "");
  const [assignee, setAssignee] = useState(normalizeAssignee(item.assigned_to));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !due) {
      setError("Title and due date are required.");
      return;
    }
    setBusy(true);
    setError("");
    const err = await patchItem(item.id, {
      title: title.trim(),
      kind,
      due_date: due,
      recur,
      jurisdiction: jurisdiction.trim() || null,
      assigned_to: assignee || null,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs font-semibold text-ink-2 hover:text-orange transition-colors">
        Edit
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="col-span-full grid grid-cols-2 gap-3 text-left">
      <label className="col-span-2 text-xs text-ink-2">
        Title
        <input className={`${inputCls} w-full mt-1`} value={title} required autoFocus
          onChange={(e) => setTitle(e.target.value)} />
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
        <input className={`${inputCls} w-full mt-1`} type="date" value={due} required
          onChange={(e) => setDue(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Repeats
        <select className={`${inputCls} w-full mt-1`} value={recur} onChange={(e) => setRecur(e.target.value)}>
          {RECUR_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink-2">
        Jurisdiction
        <input className={`${inputCls} w-full mt-1`} value={jurisdiction} placeholder="IRS / CA / —"
          onChange={(e) => setJurisdiction(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Assigned to
        <select className={`${inputCls} w-full mt-1`} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          {ASSIGNEE_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </label>
      <div className="col-span-2 flex gap-2 items-center">
        <button type="submit" disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs text-ink-2 hover:text-ink-1 px-2">
          Cancel
        </button>
        {error && <p className="text-expense text-xs">{error}</p>}
      </div>
    </form>
  );
}

// Notes + checklist, same optimistic pattern as the list row's details panel.
export function NotesAndChecklist({ item }: { item: ComplianceItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notesDraft, setNotesDraft] = useState(item.notes ?? "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(item.checklist ?? []);
  const [newText, setNewText] = useState("");

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    const err = await patchItem(item.id, fields);
    setBusy(false);
    if (err) alert(err);
    router.refresh();
  };

  const saveChecklist = (next: ChecklistItem[]) => {
    setChecklist(next);
    void patch({ checklist: next });
  };

  const newId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    setNewText("");
    saveChecklist([...checklist, { id: newId(), text, done: false }]);
  };

  const notesDirty = notesDraft !== (item.notes ?? "");
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-3">
      <label className="block text-xs text-ink-2">
        Notes
        <textarea
          className={`${inputCls} w-full mt-1 leading-relaxed`}
          rows={3}
          value={notesDraft}
          placeholder="What goes along with this filing, contacts, portal links…"
          onChange={(e) => setNotesDraft(e.target.value)}
        />
      </label>
      {notesDirty && (
        <div className="flex gap-2 items-center -mt-1">
          <button
            onClick={() => {
              const v = notesDraft.trim();
              setNotesDraft(v);
              void patch({ notes: v || null });
            }}
            disabled={busy}
            className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
          >
            Save notes
          </button>
          <button onClick={() => setNotesDraft(item.notes ?? "")}
            className="text-[11px] text-ink-2 hover:text-ink-1 px-1">
            Discard
          </button>
        </div>
      )}
      <div>
        <h3 className={`${TYPE.sectionHeader} mb-2`}>
          Checklist
          {checklist.length > 0 && (
            <span className="text-ink-3 normal-case tracking-normal tabular-nums"> · {doneCount}/{checklist.length}</span>
          )}
        </h3>
        {checklist.length > 0 && (
          <ul className="space-y-1 mb-2">
            {checklist.map((c) => (
              <li key={c.id} className="flex items-center gap-2 group">
                <input
                  type="checkbox"
                  checked={c.done}
                  disabled={busy}
                  onChange={() =>
                    saveChecklist(checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))
                  }
                  className="accent-orange w-3.5 h-3.5 shrink-0"
                />
                <span className={`text-[12px] leading-relaxed ${c.done ? "line-through text-ink-3" : "text-ink-1"}`}>
                  {c.text}
                </span>
                <button
                  onClick={() => saveChecklist(checklist.filter((x) => x.id !== c.id))}
                  disabled={busy}
                  aria-label={`Delete "${c.text}"`}
                  className="ml-auto px-1.5 text-[13px] leading-none text-ink-3 hover:text-expense opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addItem} className="flex gap-2">
          <input
            className={`${inputCls} flex-1 !py-1.5 text-[12px]`}
            value={newText}
            placeholder="Add checklist item"
            onChange={(e) => setNewText(e.target.value)}
          />
          <button type="submit" disabled={busy || !newText.trim()}
            className="text-[11px] font-semibold px-3 rounded-md bg-tile hover:bg-[#EFE6D4] text-ink-2 disabled:opacity-50">
            Add
          </button>
        </form>
      </div>
    </div>
  );
}

const fmtDate = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

function FilingRow({ itemId, filing }: { itemId: string; filing: ComplianceFiling }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [filedDate, setFiledDate] = useState(filing.filed_date);
  const [confirmation, setConfirmation] = useState(filing.confirmation ?? "");
  const [fee, setFee] = useState(filing.fee == null ? "" : String(filing.fee));
  const [notes, setNotes] = useState(filing.notes ?? "");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/admin/compliance/${itemId}/filings/${filing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filed_date: filedDate,
        confirmation: confirmation.trim() || null,
        fee: fee.trim() === "" ? null : Number(fee),
        notes: notes.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? `HTTP ${res.status}`);
      return;
    }
    setEditing(false);
    router.refresh();
  };

  const remove = async () => {
    if (!confirm(`Delete the ${fmtDate(filing.filed_date)} filing record?`)) return;
    setBusy(true);
    await fetch(`/api/admin/compliance/${itemId}/filings/${filing.id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  };

  if (editing) {
    return (
      <li className="px-5 py-3">
        <form onSubmit={save} className="grid grid-cols-2 lg:grid-cols-4 gap-2 items-end">
          <label className="text-[10px] text-ink-2">
            Filed on
            <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} type="date"
              value={filedDate} required onChange={(e) => setFiledDate(e.target.value)} />
          </label>
          <label className="text-[10px] text-ink-2">
            Confirmation #
            <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)} />
          </label>
          <label className="text-[10px] text-ink-2">
            Fee ($)
            <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} type="number"
              min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} />
          </label>
          <label className="col-span-2 lg:col-span-4 text-[10px] text-ink-2">
            Notes
            <input className={`${inputCls} block w-full mt-0.5 !py-1 !text-xs`} value={notes}
              onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="col-span-full flex gap-2">
            <button type="submit" disabled={busy}
              className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1 rounded-full disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}
              className="text-[11px] text-ink-2 hover:text-ink-1 px-2">
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  const feeNum = filing.fee == null ? null : Number(filing.fee);
  return (
    <li className={`px-5 py-3 text-sm flex items-start gap-4 group ${busy ? "opacity-60" : ""}`}>
      <span className="text-xs text-ink-2 w-24 flex-shrink-0 pt-px tabular-nums">
        {fmtDate(filing.filed_date)}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-ink-1">
          Filed{filing.filed_by ? ` by ${filing.filed_by.charAt(0).toUpperCase()}${filing.filed_by.slice(1)}` : ""}
          {filing.period_due_date && (
            <span className="text-ink-2"> · was due {fmtDate(filing.period_due_date)}</span>
          )}
        </span>
        <div className="text-xs text-ink-2 mt-0.5 space-x-2">
          {filing.confirmation && <span>conf. {filing.confirmation}</span>}
          {feeNum != null && Number.isFinite(feeNum) && (
            <span>fee ${feeNum.toLocaleString("en-US", { minimumFractionDigits: feeNum % 1 ? 2 : 0 })}</span>
          )}
        </div>
        {filing.notes && <p className="text-xs text-ink-2 mt-0.5 whitespace-pre-wrap">{filing.notes}</p>}
      </div>
      <span className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)} disabled={busy}
          className="px-2 py-0.5 rounded-md text-[11px] text-ink-2 hover:text-orange">
          Edit
        </button>
        <button onClick={() => void remove()} disabled={busy}
          className="px-2 py-0.5 rounded-md text-[11px] text-ink-2 hover:text-expense">
          Delete
        </button>
      </span>
    </li>
  );
}

export function FilingsPanel({ itemId, filings }: { itemId: string; filings: ComplianceFiling[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filedDate, setFiledDate] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fee, setFee] = useState("");
  const [notes, setNotes] = useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filedDate) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/compliance/${itemId}/filings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filed_date: filedDate,
        confirmation: confirmation.trim() || undefined,
        fee: fee.trim() === "" ? undefined : Number(fee),
        notes: notes.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j.error as string) ?? `HTTP ${res.status}`);
      return;
    }
    setFiledDate(""); setConfirmation(""); setFee(""); setNotes("");
    setOpen(false);
    router.refresh();
  };

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3 flex-wrap">
        <h2 className={TYPE.cardTitle}>
          Filing history {filings.length > 0 && <span className="text-ink-3 font-normal">· {filings.length}</span>}
        </h2>
        <button onClick={() => setOpen((v) => !v)}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors">
          {open ? "Close" : "+ Past filing"}
        </button>
      </div>

      {open && (
        <form onSubmit={add} className="px-5 py-4 border-b border-outline bg-surface grid grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <label className="text-xs text-ink-2">
            Filed on
            <input className={`${inputCls} w-full mt-1`} type="date" value={filedDate} required autoFocus
              onChange={(e) => setFiledDate(e.target.value)} />
          </label>
          <label className="text-xs text-ink-2">
            Confirmation #
            <input className={`${inputCls} w-full mt-1`} value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)} />
          </label>
          <label className="text-xs text-ink-2">
            Fee ($)
            <input className={`${inputCls} w-full mt-1`} type="number" min="0" step="0.01" value={fee}
              onChange={(e) => setFee(e.target.value)} />
          </label>
          <label className="text-xs text-ink-2">
            Notes
            <input className={`${inputCls} w-full mt-1`} value={notes}
              onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="col-span-full flex gap-2 items-center">
            <button type="submit" disabled={busy || !filedDate}
              className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
              {busy ? "Saving…" : "Record filing"}
            </button>
            {error && <p className="text-expense text-xs">{error}</p>}
          </div>
        </form>
      )}

      {filings.length === 0 ? (
        <p className={`p-6 ${TYPE.bodyMuted}`}>
          No filings recorded yet. &ldquo;Mark filed&rdquo; records one automatically; backfill past
          years with &ldquo;+ Past filing&rdquo;.
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {filings.map((f) => (
            <FilingRow key={f.id} itemId={itemId} filing={f} />
          ))}
        </ul>
      )}
    </section>
  );
}
