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
};

type Props = {
  year: number;
  initialPledges: Pledge[];
  fundraisingGoal: number;
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

export default function PledgesEditor({ year, initialPledges, fundraisingGoal }: Props) {
  const router = useRouter();
  const [pledges, setPledges] = useState<Pledge[]>(initialPledges);
  const [adding, setAdding] = useState(false);

  // New-pledge form state.
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

  async function create() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/admin/finance/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year,
        source_type: src,
        source_name: name,
        amount: Number(amount.replace(/,/g, "")),
        status: stat,
        probability: prob === "" ? null : Number(prob) / 100,
        expected_date: date || null,
        restricted,
        restricted_to: restricted ? restrictedTo : null,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setError(j.error ?? "Failed to create pledge");
      return;
    }
    setPledges((p) => [j.pledge, ...p]);
    setName("");
    setAmount("");
    setProb("");
    setDate("");
    setRestricted(false);
    setRestrictedTo("");
    setAdding(false);
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
  // Probability-weighted projected — what we actually expect to land.
  const projectedWeighted = projected.reduce(
    (s, p) => s + Number(p.amount) * (p.probability ?? 1),
    0
  );
  const receivedTotal = received.reduce((s, p) => s + Number(p.amount), 0);

  const towardsGoal = securedTotal + receivedTotal;
  const goalPct = fundraisingGoal > 0 ? (towardsGoal / fundraisingGoal) * 100 : 0;
  const goalPctWithProj = fundraisingGoal > 0
    ? ((towardsGoal + projectedWeighted) / fundraisingGoal) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Goal progress */}
      <div className="rounded-card-lg border border-white/10 bg-white/[0.02] p-5">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div className="text-sm text-gray-mid uppercase tracking-wide">
            Toward {year} fundraising goal
          </div>
          <div className="text-cream/80 text-sm">
            <span className="text-orange font-medium">{fmt(towardsGoal)}</span>
            <span className="text-gray-mid"> · received + secured</span>
          </div>
        </div>
        <div className="relative h-7 rounded-full bg-white/5 overflow-hidden">
          {/* Probability-weighted projected layer (back). */}
          <div
            className="absolute inset-y-0 left-0 bg-orange/25"
            style={{ width: `${Math.min(100, goalPctWithProj)}%` }}
          />
          {/* Hard-money layer (front). */}
          <div
            className="absolute inset-y-0 left-0 bg-orange"
            style={{ width: `${Math.min(100, goalPct)}%` }}
          />
          {/* Goal threshold marker would go at 100%; here the bar's edge is
              the goal so we just label it. */}
          <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] text-cream/80 font-medium">
            <span>{goalPct.toFixed(0)}% hard</span>
            <span className="text-cream/60">
              {goalPctWithProj.toFixed(0)}% w/ weighted pipeline
            </span>
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-mid">
          Goal {fmt(fundraisingGoal)} · weighted pipeline {fmt(projectedWeighted)} of {fmt(projectedTotal)} raw
        </div>
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
          onClick={() => setAdding(true)}
          className="px-3 py-1.5 rounded-lg bg-orange hover:bg-orange-dark text-cream text-sm font-medium"
        >
          + Add pledge
        </button>
      )}

      {adding && (
        <div className="rounded-card-lg border border-white/10 bg-white/[0.02] p-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Source type">
              <select
                value={src}
                onChange={(e) => setSrc(e.target.value as Pledge["source_type"])}
                className="w-full bg-ink border border-white/10 rounded px-2 py-1.5 text-sm text-cream"
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
                className="w-full bg-ink border border-white/10 rounded px-2 py-1.5 text-sm text-cream"
              />
            </Field>
            <Field label="Amount ($)">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="50000"
                className="w-full bg-ink border border-white/10 rounded px-2 py-1.5 text-sm text-cream"
              />
            </Field>
            <Field label="Status">
              <select
                value={stat}
                onChange={(e) => setStat(e.target.value as Pledge["status"])}
                className="w-full bg-ink border border-white/10 rounded px-2 py-1.5 text-sm text-cream"
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
                className="w-full bg-ink border border-white/10 rounded px-2 py-1.5 text-sm text-cream"
              />
            </Field>
            <Field label="Expected date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-ink border border-white/10 rounded px-2 py-1.5 text-sm text-cream"
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
                    className="flex-1 bg-ink border border-white/10 rounded px-2 py-1.5 text-sm text-cream"
                  />
                )}
              </div>
            </Field>
          </div>
          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !name || !amount}
              onClick={create}
              className="px-3 py-1.5 rounded-lg bg-orange hover:bg-orange-dark text-cream text-sm font-medium disabled:opacity-40"
            >
              Save pledge
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="px-3 py-1.5 rounded-lg text-cream/80 hover:text-cream text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sectioned lists */}
      <PledgeSection title="Received" rows={received} onMark={null} onDelete={remove} />
      <PledgeSection title="Secured" rows={secured} onMark={markReceived} onDelete={remove} />
      <PledgeSection title="Projected pipeline" rows={projected} onMark={markReceived} onDelete={remove} />
    </div>
  );
}

function PledgeSection({
  title,
  rows,
  onMark,
  onDelete,
}: {
  title: string;
  rows: Pledge[];
  onMark: ((id: string) => void) | null;
  onDelete: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-card-lg border border-white/10 bg-white/[0.02] overflow-hidden">
      <header className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-orange font-medium">{title}</div>
        <div className="text-xs text-gray-mid">
          {rows.length} ·{" "}
          {fmt(rows.reduce((s, r) => s + Number(r.amount), 0))}
        </div>
      </header>
      <table className="w-full text-xs">
        <thead className="text-gray-mid uppercase tracking-wider">
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
            <tr key={p.id} className="border-t border-white/5">
              <td className="px-3 py-2 text-cream/85">{p.source_name}</td>
              <td className="px-3 py-2 text-gray-mid">{p.source_type}</td>
              <td className="px-3 py-2 text-right font-mono text-cream/85">
                {fmt(Number(p.amount))}
              </td>
              <td className="px-3 py-2 text-right text-gray-mid">
                {p.probability !== null ? `${Math.round(p.probability * 100)}%` : "—"}
              </td>
              <td className="px-3 py-2 text-gray-mid font-mono">{p.expected_date ?? "—"}</td>
              <td className="px-3 py-2 text-gray-mid">
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
                    className="text-xs text-emerald-300 hover:text-emerald-200 mr-3"
                  >
                    Mark received
                  </button>
                )}
                <button
                  onClick={() => onDelete(p.id)}
                  className="text-xs text-gray-mid hover:text-red-300"
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
    <div className="rounded-card border border-white/10 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-mid mb-1">{label}</div>
      <div className={`text-lg font-medium ${accent ? "text-orange" : "text-cream"}`}>{value}</div>
      <div className="text-[10px] text-gray-mid mt-0.5">{count} pledges</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-mid mb-1">{label}</span>
      {children}
    </label>
  );
}
