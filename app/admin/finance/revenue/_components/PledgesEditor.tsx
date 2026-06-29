"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Pledge = {
  id: string;
  year: number;
  source_type: "foundation" | "individual" | "corporate" | "government" | "accelerator" | "earned" | "other";
  source_name: string;
  amount: number;
  status: "secured" | "projected" | "received";
  expected_date: string | null;
  probability: number | null;
  restricted: boolean;
  restricted_to: string | null;
  notes: string | null;
  external_ref: string | null;
};

type Props = {
  year: number;
  initialPledges: Pledge[];
};

const SOURCE_TYPES: Array<Pledge["source_type"]> = [
  "foundation",
  "individual",
  "corporate",
  "government",
  "accelerator",
  "earned",
  "other",
];

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function PledgesEditor({ year, initialPledges }: Props) {
  const router = useRouter();
  const [pledges, setPledges] = useState<Pledge[]>(initialPledges);
  const [adding, setAdding] = useState(false);
  // Set when the form is editing an existing row (vs. adding a new one).
  const [editingId, setEditingId] = useState<string | null>(null);

  // New-commitment form state.
  const [src, setSrc] = useState<Pledge["source_type"]>("foundation");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [stat, setStat] = useState<Pledge["status"]>("projected");
  const [prob, setProb] = useState("");
  const [date, setDate] = useState("");
  const [restricted, setRestricted] = useState(false);
  const [restrictedTo, setRestrictedTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setAmount("");
    setProb("");
    setDate("");
    setRestricted(false);
    setRestrictedTo("");
    setSrc("foundation");
    setStat("projected");
    setEditingId(null);
    setAdding(false);
    setError(null);
  }

  function startEdit(p: Pledge) {
    setEditingId(p.id);
    setSrc(p.source_type);
    setName(p.source_name);
    setAmount(String(p.amount));
    setStat(p.status);
    setProb(p.probability === null ? "" : String(Math.round(p.probability * 100)));
    setDate(p.expected_date ?? "");
    setRestricted(p.restricted);
    setRestrictedTo(p.restricted_to ?? "");
    setError(null);
    setAdding(true);
  }

  // Create (POST) or, when editing an existing row, update (PATCH) — same form.
  async function save() {
    setBusy(true);
    setError(null);
    const fields = {
      source_type: src,
      source_name: name,
      amount: Number(amount.replace(/,/g, "")),
      status: stat,
      probability: prob === "" ? null : Number(prob) / 100,
      expected_date: date || null,
      restricted,
      restricted_to: restricted ? restrictedTo : null,
    };
    const r = await fetch(
      editingId ? `/api/admin/finance/revenue/${editingId}` : "/api/admin/finance/revenue",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? fields : { year, ...fields }),
      }
    );
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setError(j.error ?? "Failed to save commitment");
      return;
    }
    if (editingId) {
      setPledges((p) => p.map((x) => (x.id === editingId ? (j.pledge ?? { ...x, ...fields }) : x)));
    } else {
      setPledges((p) => [j.pledge, ...p]);
    }
    resetForm();
  }

  async function markReceived(id: string) {
    const prev = pledges;
    setPledges((p) => p.map((x) => (x.id === id ? { ...x, status: "received" } : x)));
    const r = await fetch(`/api/admin/finance/revenue/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "received" }),
    });
    if (!r.ok) setPledges(prev);
    else router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this pledge?")) return;
    const prev = pledges;
    setPledges((p) => p.filter((x) => x.id !== id));
    const r = await fetch(`/api/admin/finance/revenue/${id}`, { method: "DELETE" });
    if (!r.ok) setPledges(prev);
  }

  // Buckets — separated for display, summed for the headers above.
  const secured = pledges.filter((p) => p.status === "secured");
  const projected = pledges.filter((p) => p.status === "projected");
  const received = pledges.filter((p) => p.status === "received");

  const securedTotal = secured.reduce((s, p) => s + Number(p.amount), 0);
  const projectedTotal = projected.reduce((s, p) => s + Number(p.amount), 0);
  const projectedWeighted = projected.reduce((s, p) => s + Number(p.amount) * (p.probability ?? 1), 0);
  const receivedTotal = received.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      {/* Header — these are manual one-offs; the canonical schedule + goal
          progress live in the Revenue schedule panel above. */}
      <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
        <h2 className="font-heading font-bold text-ink-1 text-lg">Manual commitments</h2>
        <p className="text-xs text-ink-2 mt-1 max-w-2xl">
          One-off commitments not in the pipeline — a verbal board pledge, a grant promised by
          phone. Pipeline and grants flow into the schedule above automatically; record here only
          what isn&apos;t already tracked elsewhere. These rows join the schedule and feed runway.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Received" value={fmt(receivedTotal)} count={received.length} accent />
        <Card label="Secured" value={fmt(securedTotal)} count={secured.length} accent />
        <Card label="Projected (raw)" value={fmt(projectedTotal)} count={projected.length} />
        <Card label="Projected (weighted)" value={fmt(projectedWeighted)} count={projected.length} />
      </div>

      {/* Add button / form */}
      {!adding && (
        <button
          type="button"
          onClick={() => { resetForm(); setAdding(true); }}
          className="px-3 py-1.5 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium"
        >
          + Add commitment
        </button>
      )}

      {adding && (
        <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
          <div className="text-[11px] uppercase tracking-wider text-ink-2 font-medium mb-3">
            {editingId ? "Edit commitment" : "New commitment"}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Source type">
              <select
                value={src}
                onChange={(e) => setSrc(e.target.value as Pledge["source_type"])}
                className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
              >
                {SOURCE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mott Foundation"
                className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
              />
            </Field>
            <Field label="Amount ($)">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="50000"
                className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
              />
            </Field>
            <Field label="Status">
              <select
                value={stat}
                onChange={(e) => setStat(e.target.value as Pledge["status"])}
                className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
              >
                <option value="projected">Projected</option>
                <option value="secured">Secured</option>
                <option value="received">Received</option>
              </select>
            </Field>
            <Field label="Probability % (projected only)">
              <input
                value={prob}
                onChange={(e) => setProb(e.target.value)}
                inputMode="decimal"
                placeholder="50"
                className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
              />
            </Field>
            <Field label="Expected date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
              />
            </Field>
            <Field label="Restricted?">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={restricted}
                  onChange={(e) => setRestricted(e.target.checked)}
                  className="accent-orange"
                />
                {restricted && (
                  <input
                    value={restrictedTo}
                    onChange={(e) => setRestrictedTo(e.target.value)}
                    placeholder="restricted to…"
                    className="flex-1 bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1"
                  />
                )}
              </div>
            </Field>
          </div>
          {error && <p className="mt-3 text-xs text-expense">{error}</p>}
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !name || !amount}
              onClick={save}
              className="px-3 py-1.5 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium disabled:opacity-40"
            >
              {busy ? "Saving…" : editingId ? "Save changes" : "Save pledge"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 rounded-lg text-ink-1 hover:text-ink-1 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Manual commitment lists by status. */}
      {pledges.length === 0 && !adding && (
        <div className="text-sm text-ink-2 py-8 text-center border border-dashed border-outline rounded-card">
          No manual commitments yet. Most money flows in through the schedule above
          (grants, pledges, pipeline) — add a row here only for a one-off that isn&apos;t
          tracked elsewhere.
        </div>
      )}
      <PledgeSection title="Received" rows={received} onMark={null} onEdit={startEdit} onDelete={remove} />
      <PledgeSection title="Secured" rows={secured} onMark={markReceived} onEdit={startEdit} onDelete={remove} />
      <PledgeSection title="Projected pipeline" rows={projected} onMark={markReceived} onEdit={startEdit} onDelete={remove} />
    </div>
  );
}

function PledgeSection({
  title,
  rows,
  onMark,
  onEdit,
  onDelete,
}: {
  title: string;
  rows: Pledge[];
  onMark: ((id: string) => void) | null;
  onEdit: (p: Pledge) => void;
  onDelete: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel overflow-hidden">
      <header className="px-4 py-2.5 border-b border-hairline flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-orange font-medium">{title}</div>
        <div className="text-xs text-ink-2">
          {rows.length} ·{" "}
          {fmt(rows.reduce((s, r) => s + Number(r.amount), 0))}
        </div>
      </header>
      <table className="w-full text-xs">
        <thead className="text-ink-2 uppercase tracking-wider">
          <tr>
            <th className="text-left px-3 py-2">Source</th>
            <th className="text-left px-3 py-2 w-32">Type</th>
            <th className="text-right px-3 py-2 w-32">Amount</th>
            <th className="text-right px-3 py-2 w-20">Prob.</th>
            <th className="text-left px-3 py-2 w-32">Expected</th>
            <th className="text-left px-3 py-2 w-32">Restricted</th>
            <th className="w-32"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-hairline">
              <td className="px-3 py-2 text-ink-1">{p.source_name}</td>
              <td className="px-3 py-2 text-ink-2">{p.source_type}</td>
              <td className="px-3 py-2 text-right font-mono text-ink-1">
                {fmt(Number(p.amount))}
              </td>
              <td className="px-3 py-2 text-right text-ink-2">
                {p.probability !== null ? `${Math.round(p.probability * 100)}%` : "—"}
              </td>
              <td className="px-3 py-2 text-ink-2 font-mono">{p.expected_date ?? "—"}</td>
              <td className="px-3 py-2 text-ink-2">
                {p.restricted ? (
                  <span className="text-orange">
                    {p.restricted_to ?? "yes"}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {onMark && (
                  <button
                    onClick={() => onMark(p.id)}
                    className="text-xs text-revenue hover:text-revenue mr-3"
                  >
                    Mark received
                  </button>
                )}
                <button
                  onClick={() => onEdit(p)}
                  className="text-xs text-ink-2 hover:text-orange mr-3"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(p.id)}
                  className="text-xs text-ink-2 hover:text-expense"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ label, value, count, accent }: { label: string; value: string; count: number; accent?: boolean }) {
  return (
    <div className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-2 mb-1">{label}</div>
      <div className={`text-lg font-medium ${accent ? "text-orange" : "text-ink-1"}`}>{value}</div>
      <div className="text-[10px] text-ink-2 mt-0.5">{count} pledges</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}
