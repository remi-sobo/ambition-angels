"use client";

// Client controls for the Ask Log: create form, status select, editable
// details, and the document uploader. All call the admin APIs then
// router.refresh() so the server pages re-render with fresh data.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FunderPicker, { type FunderChoice } from "../../_components/FunderPicker";
import {
  ASK_FORMS,
  ASK_STATUSES,
  ASK_STATUS_LABELS,
  askStatusTone,
} from "@/lib/fundraising/asks";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
const fieldLabel = "flex flex-col gap-1 text-[11px] uppercase tracking-wider text-ink-3 font-semibold";

const funderPayload = (f: FunderChoice): Record<string, string> =>
  f.funderId ? { funder_id: f.funderId } : { funder_name: f.funderName.trim() };

const toneChip = (tone: ReturnType<typeof askStatusTone>) =>
  tone === "won"
    ? "bg-revenue-bg text-revenue border-revenue/30"
    : tone === "lost"
    ? "bg-expense-bg text-expense border-expense/30"
    : tone === "open"
    ? "bg-orange/10 text-orange border-orange/30"
    : "bg-tile text-ink-2 border-outline";

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${toneChip(askStatusTone(status))}`}>
      {ASK_STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── New ask ─────────────────────────────────────────────────────────────────
// grantId/opportunityId + a fixed funder pre-link the ask when it's created
// from a grant's page; otherwise the funder is picked here.

export function NewAskForm({
  grantId,
  opportunityId,
  fixedFunder,
  compact,
}: {
  grantId?: string;
  opportunityId?: string;
  fixedFunder?: { id: string; name: string };
  compact?: boolean;
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [funder, setFunder] = useState<FunderChoice>(
    fixedFunder ? { funderId: fixedFunder.id, funderName: fixedFunder.name } : { funderId: null, funderName: "" }
  );
  const [form, setForm] = useState<string>(grantId ? "grant_proposal" : "grant_proposal");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [askDate, setAskDate] = useState("");
  const [status, setStatus] = useState("draft");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!funder.funderId && !funder.funderName.trim()) {
      setError("Every ask needs a funder.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/asks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...funderPayload(funder),
          form,
          title: title.trim() || undefined,
          amount_requested: amount ? Number(amount) : undefined,
          ask_date: askDate || undefined,
          status,
          grant_id: grantId,
          opportunity_id: opportunityId,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setTitle(""); setAmount(""); setAskDate(""); setStatus("draft");
      if (!fixedFunder) setFunder({ funderId: null, funderName: "" });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log ask");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors ${compact ? "" : ""}`}
      >
        + Log an ask
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4 flex flex-wrap items-end gap-3 w-full">
      {!fixedFunder && (
        <label className={fieldLabel}>
          Funder *
          <FunderPicker value={funder} onChange={setFunder} placeholder="Foundation or person" className="w-56" />
        </label>
      )}
      {fixedFunder && (
        <div className={fieldLabel}>
          Funder
          <span className="text-sm text-ink-1 font-body normal-case tracking-normal py-2">{fixedFunder.name}</span>
        </div>
      )}
      <label className={fieldLabel}>
        Form
        <select value={form} onChange={(e) => setForm(e.target.value)} className={inputCls}>
          {ASK_FORMS.map(([v, l]) => (
            <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
          ))}
        </select>
      </label>
      <label className={fieldLabel}>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. FY27 general operating" className={inputCls + " w-52"} />
      </label>
      <label className={fieldLabel}>
        Ask ($)
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls + " w-28"} />
      </label>
      <label className={fieldLabel}>
        Ask date
        <input type="date" value={askDate} onChange={(e) => setAskDate(e.target.value)} className={inputCls + " w-40"} />
      </label>
      <label className={fieldLabel}>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          {ASK_STATUSES.map(([v, l]) => (
            <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
          {busy ? "Saving…" : "Log ask"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-ink-2 hover:text-ink-1 px-2 py-2 transition-colors">
          Cancel
        </button>
      </div>
      {error && <p className="text-expense text-xs w-full">{error}</p>}
    </form>
  );
}

// ── Status select (detail header) ───────────────────────────────────────────

export function AskStatusSelect({ askId, status }: { askId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <select
      value={status}
      disabled={busy}
      onChange={async (e) => {
        setBusy(true);
        try {
          await fetch(`/api/admin/asks/${askId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: e.target.value }),
          });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1.5 text-ink-1 text-xs focus:outline-none focus:border-orange/40 disabled:opacity-50"
    >
      {ASK_STATUSES.map(([v, l]) => (
        <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
      ))}
    </select>
  );
}

// ── Editable details ────────────────────────────────────────────────────────

export type AskDetails = {
  id: string;
  funderId: string | null;
  funderName: string;
  form: string;
  title: string | null;
  amount_requested: number | null;
  amount_committed: number | null;
  ask_date: string | null;
  decided_on: string | null;
  owner: string | null;
  notes: string | null;
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function EditableAskDetails({ ask }: { ask: AskDetails }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [funder, setFunder] = useState<FunderChoice>({ funderId: ask.funderId, funderName: ask.funderName });
  const [form, setForm] = useState(ask.form);
  const [title, setTitle] = useState(ask.title ?? "");
  const [requested, setRequested] = useState(ask.amount_requested?.toString() ?? "");
  const [committed, setCommitted] = useState(ask.amount_committed?.toString() ?? "");
  const [askDate, setAskDate] = useState(ask.ask_date ?? "");
  const [decidedOn, setDecidedOn] = useState(ask.decided_on ?? "");
  const [owner, setOwner] = useState(ask.owner ?? "");
  const [notes, setNotes] = useState(ask.notes ?? "");

  const startEdit = () => {
    setFunder({ funderId: ask.funderId, funderName: ask.funderName });
    setForm(ask.form);
    setTitle(ask.title ?? "");
    setRequested(ask.amount_requested?.toString() ?? "");
    setCommitted(ask.amount_committed?.toString() ?? "");
    setAskDate(ask.ask_date ?? "");
    setDecidedOn(ask.decided_on ?? "");
    setOwner(ask.owner ?? "");
    setNotes(ask.notes ?? "");
    setError("");
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!funder.funderId && !funder.funderName.trim()) {
      setError("A funder is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/asks/${ask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...funderPayload(funder),
          form,
          title: title.trim() || null,
          amount_requested: requested.trim() === "" ? null : Number(requested),
          amount_committed: committed.trim() === "" ? null : Number(committed),
          ask_date: askDate || null,
          decided_on: decidedOn || null,
          owner: owner.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save ask");
    } finally {
      setBusy(false);
    }
  };

  const formLabel = ASK_FORMS.find(([v]) => v === ask.form)?.[1] ?? ask.form;

  if (!editing) {
    const facts: Array<[string, string]> = [
      ["Funder", ask.funderName || "—"],
      ["Form", formLabel],
      ["Requested", ask.amount_requested != null ? fmtMoney(ask.amount_requested) : "—"],
      ["Committed", ask.amount_committed != null ? fmtMoney(ask.amount_committed) : "—"],
      ["Ask date", ask.ask_date ? fmtDay(ask.ask_date) : "—"],
      ["Decided", ask.decided_on ? fmtDay(ask.decided_on) : "—"],
      ["Owner", ask.owner ?? "—"],
    ];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-ink-1 text-sm">Details</h2>
          <button onClick={startEdit} className="text-[11px] font-semibold text-orange hover:text-orange-dark transition-colors">
            Edit
          </button>
        </div>
        {facts.map(([label, value]) => (
          <div key={label} className="flex gap-3 text-xs">
            <span className="text-ink-3 w-24 flex-shrink-0 uppercase tracking-wider font-semibold pt-px">{label}</span>
            <span className="text-ink-1 break-words min-w-0">{value}</span>
          </div>
        ))}
        {ask.notes && <p className="text-xs text-ink-2 border-t border-outline pt-3 whitespace-pre-wrap">{ask.notes}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <h2 className="font-heading font-bold text-ink-1 text-sm">Edit ask</h2>
      <label className={fieldLabel}>
        Funder *
        <FunderPicker value={funder} onChange={setFunder} placeholder="Foundation or person" />
      </label>
      <label className={fieldLabel}>
        Form
        <select value={form} onChange={(e) => setForm(e.target.value)} className={inputCls}>
          {ASK_FORMS.map(([v, l]) => (
            <option key={v} value={v} className="bg-tile shadow-tile">{l}</option>
          ))}
        </select>
      </label>
      <label className={fieldLabel}>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={fieldLabel}>
          Requested ($)
          <input type="number" min="0" step="0.01" value={requested} onChange={(e) => setRequested(e.target.value)} className={inputCls} />
        </label>
        <label className={fieldLabel}>
          Committed ($)
          <input type="number" min="0" step="0.01" value={committed} onChange={(e) => setCommitted(e.target.value)} className={inputCls} />
        </label>
        <label className={fieldLabel}>
          Ask date
          <input type="date" value={askDate} onChange={(e) => setAskDate(e.target.value)} className={inputCls} />
        </label>
        <label className={fieldLabel}>
          Decided on
          <input type="date" value={decidedOn} onChange={(e) => setDecidedOn(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className={fieldLabel}>
        Owner
        <input value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls} />
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

// ── Documents ───────────────────────────────────────────────────────────────

export type AskDocument = {
  id: string;
  filename: string;
  label: string | null;
  mime: string | null;
  size_bytes: number | null;
  created_at: string;
};

const fmtSize = (n: number | null) => {
  if (!n) return "";
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
};

export function AskDocuments({ askId, documents }: { askId: string; documents: AskDocument[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (label.trim()) fd.set("label", label.trim());
      const res = await fetch(`/api/admin/asks/${askId}/documents`, { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (docId: string) => {
    if (!confirm("Remove this document?")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/asks/${askId}/documents/${docId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {documents.length === 0 ? (
        <p className="px-5 py-6 text-ink-2 text-sm">
          No documents yet. Upload the proposal PDF, cover letter, or budget — the paper trail for
          this ask lives here.
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {documents.map((d) => (
            <li key={d.id} className="px-5 py-3 flex items-center gap-3">
              <span className="text-lg" aria-hidden>
                {d.mime === "application/pdf" ? "📄" : d.mime?.startsWith("image/") ? "🖼️" : "📎"}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/admin/asks/${askId}/documents/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-ink-1 font-medium truncate hover:text-orange transition-colors block"
                >
                  {d.label || d.filename}
                </a>
                <div className="text-[11px] text-ink-3 truncate">
                  {d.label ? `${d.filename} · ` : ""}
                  {fmtSize(d.size_bytes)}
                </div>
              </div>
              <button
                disabled={busy}
                onClick={() => remove(d.id)}
                className="text-[11px] font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-outline">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className={inputCls + " text-xs w-40"}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          className="text-xs text-ink-2 file:mr-2 file:rounded-full file:border-0 file:bg-orange/10 file:text-orange file:font-semibold file:px-3 file:py-1.5 file:text-xs hover:file:bg-orange/20"
        />
        {busy && <span className="text-[11px] text-ink-3">Uploading…</span>}
        {error && <p className="text-expense text-xs w-full">{error}</p>}
      </div>
    </div>
  );
}

// ── Delete ask ──────────────────────────────────────────────────────────────

export function DeleteAskButton({ askId }: { askId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        if (!confirm("Delete this ask and all its documents? This can't be undone.")) return;
        setBusy(true);
        try {
          const res = await fetch(`/api/admin/asks/${askId}`, { method: "DELETE" });
          if (res.ok) router.push("/admin/fundraising/asks");
        } finally {
          setBusy(false);
        }
      }}
      className="text-[11px] font-semibold text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
    >
      Delete ask
    </button>
  );
}
