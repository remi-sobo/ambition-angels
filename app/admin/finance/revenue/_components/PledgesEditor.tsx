"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HubSpotPledge } from "@/lib/finance/hubspot-pledges";

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
  fundraisingGoal: number;
  hubspotPledges: HubSpotPledge[];
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

export default function PledgesEditor({
  year,
  initialPledges,
  fundraisingGoal,
  hubspotPledges,
}: Props) {
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
  const [adoptingId, setAdoptingId] = useState<string | null>(null);
  const [adoptError, setAdoptError] = useState<string | null>(null);

  // Adopt a HubSpot deal into an editable Bloom pledge. Carries external_ref =
  // deal_id so the assembler hides the HubSpot original (no double-count); the
  // new row is then a normal editable pledge.
  async function adopt(deal: HubSpotPledge) {
    setAdoptingId(deal.deal_id);
    setAdoptError(null);
    const r = await fetch("/api/admin/finance/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year,
        source_type: "other",
        source_name: deal.company_name || deal.contact_name || deal.name,
        amount: deal.amount,
        status: deal.status,
        expected_date: deal.close_date,
        probability: deal.status === "projected" ? deal.probability : null,
        restricted: false,
        external_ref: deal.deal_id,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setAdoptingId(null);
    if (!r.ok) {
      setAdoptError(j.error ?? "Failed to adopt deal");
      return;
    }
    setPledges((p) => [j.pledge, ...p]); // hides the HubSpot row via external_ref
    router.refresh();
  }

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

  // Deals already adopted into Bloom (by external_ref) are hidden from the
  // HubSpot section and dropped from its sums — they now count from the Bloom
  // side, so showing them here would double-count.
  const adoptedRefs = new Set(
    pledges.map((p) => p.external_ref).filter((r): r is string => !!r)
  );
  const visibleHubspot = hubspotPledges.filter((p) => !adoptedRefs.has(p.deal_id));

  // HubSpot buckets, computed once and used in both the summary cards and
  // the rendered "From HubSpot" section.
  const hsReceived = visibleHubspot.filter((p) => p.status === "received");
  const hsSecured = visibleHubspot.filter((p) => p.status === "secured");
  const hsProjected = visibleHubspot.filter((p) => p.status === "projected");

  const securedTotal =
    secured.reduce((s, p) => s + Number(p.amount), 0) +
    hsSecured.reduce((s, p) => s + p.amount, 0);
  const projectedTotal =
    projected.reduce((s, p) => s + Number(p.amount), 0) +
    hsProjected.reduce((s, p) => s + p.amount, 0);
  // Probability-weighted projected — what we actually expect to land.
  const projectedWeighted =
    projected.reduce((s, p) => s + Number(p.amount) * (p.probability ?? 1), 0) +
    hsProjected.reduce((s, p) => s + p.amount * p.probability, 0);
  const receivedTotal =
    received.reduce((s, p) => s + Number(p.amount), 0) +
    hsReceived.reduce((s, p) => s + p.amount, 0);

  const towardsGoal = securedTotal + receivedTotal;
  const goalPct = fundraisingGoal > 0 ? (towardsGoal / fundraisingGoal) * 100 : 0;
  const goalPctWithProj = fundraisingGoal > 0
    ? ((towardsGoal + projectedWeighted) / fundraisingGoal) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Goal progress */}
      <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div className="text-sm text-ink-2 uppercase tracking-wide">
            Toward {year} fundraising goal
          </div>
          <div className="text-ink-1 text-sm">
            <span className="text-orange font-medium">{fmt(towardsGoal)}</span>
            <span className="text-ink-2"> · received + secured</span>
          </div>
        </div>
        <div className="relative h-7 rounded-full bg-tile overflow-hidden">
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
          <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] text-ink-1 font-medium">
            <span>{goalPct.toFixed(0)}% hard</span>
            <span className="text-ink-2">
              {goalPctWithProj.toFixed(0)}% w/ weighted pipeline
            </span>
          </div>
        </div>
        <div className="mt-2 text-xs text-ink-2">
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
          className="px-3 py-1.5 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium"
        >
          + Add pledge
        </button>
      )}

      {adding && (
        <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5">
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
              onClick={create}
              className="px-3 py-1.5 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium disabled:opacity-40"
            >
              Save pledge
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="px-3 py-1.5 rounded-lg text-ink-1 hover:text-ink-1 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sectioned lists — manual pledges first, then HubSpot pipeline. */}
      <PledgeSection title="Received" rows={received} onMark={null} onDelete={remove} />
      <PledgeSection title="Secured" rows={secured} onMark={markReceived} onDelete={remove} />
      <PledgeSection title="Projected pipeline" rows={projected} onMark={markReceived} onDelete={remove} />

      {/* HubSpot — read-only pipeline, refreshed by the "Sync HubSpot"
          button in the sidebar. Counted in the summary cards + goal
          progress above. */}
      {visibleHubspot.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h2 className="text-[10px] uppercase tracking-widest text-orange/80 font-medium">
              From HubSpot pipeline
            </h2>
            <div className="text-[11px] text-ink-2">
              {visibleHubspot.length} deal{visibleHubspot.length === 1 ? "" : "s"} ·
              {" "}&ldquo;Adopt &amp; edit&rdquo; to fix a date or amount · refresh via &ldquo;Sync HubSpot&rdquo;
            </div>
          </div>
          {adoptError && <p className="text-xs text-expense">{adoptError}</p>}
          <HubSpotSection title="HubSpot · Received" rows={hsReceived} onAdopt={adopt} adoptingId={adoptingId} />
          <HubSpotSection title="HubSpot · Secured" rows={hsSecured} onAdopt={adopt} adoptingId={adoptingId} />
          <HubSpotSection title="HubSpot · Projected pipeline" rows={hsProjected} showProbability onAdopt={adopt} adoptingId={adoptingId} />
        </div>
      )}
    </div>
  );
}

function HubSpotSection({
  title,
  rows,
  showProbability,
  onAdopt,
  adoptingId,
}: {
  title: string;
  rows: HubSpotPledge[];
  showProbability?: boolean;
  onAdopt: (deal: HubSpotPledge) => void;
  adoptingId: string | null;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel overflow-hidden">
      <header className="px-4 py-2.5 border-b border-hairline flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-orange font-medium">
          {title}
        </div>
        <div className="text-xs text-ink-2">
          {rows.length} · {fmt(rows.reduce((s, r) => s + r.amount, 0))}
        </div>
      </header>
      <table className="w-full text-xs">
        <thead className="text-ink-2 uppercase tracking-wider">
          <tr>
            <th className="text-left px-3 py-2">Deal</th>
            <th className="text-left px-3 py-2 w-48">Contact / company</th>
            <th className="text-left px-3 py-2 w-32">Stage</th>
            <th className="text-right px-3 py-2 w-32">Amount</th>
            {showProbability && (
              <th className="text-right px-3 py-2 w-24">Weighted</th>
            )}
            <th className="text-left px-3 py-2 w-32">Close date</th>
            <th className="w-28"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.deal_id} className="border-t border-hairline">
              <td className="px-3 py-2 text-ink-1">{d.name}</td>
              <td className="px-3 py-2 text-ink-2">
                {d.contact_name ?? d.company_name ?? "—"}
                {d.contact_name && d.company_name && (
                  <span className="text-[10px] text-ink-2/70 block">
                    {d.company_name}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-ink-2">{d.stage ?? "—"}</td>
              <td className="px-3 py-2 text-right font-mono text-ink-1">
                {fmt(d.amount)}
              </td>
              {showProbability && (
                <td className="px-3 py-2 text-right font-mono text-orange/90">
                  {fmt(d.amount * d.probability)}
                  <span className="text-[10px] text-ink-2 block">
                    @ {Math.round(d.probability * 100)}%
                  </span>
                </td>
              )}
              <td className="px-3 py-2 text-ink-2 font-mono">
                {d.close_date ?? "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onAdopt(d)}
                  disabled={adoptingId === d.deal_id}
                  className="text-[11px] px-2 py-0.5 rounded border border-orange/50 text-orange hover:bg-orange/10 disabled:opacity-50"
                  title="Create an editable Bloom pledge from this deal"
                >
                  {adoptingId === d.deal_id ? "Adopting…" : "Adopt & edit"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
