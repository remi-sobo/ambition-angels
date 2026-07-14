"use client";

// Unified Revenue tab: one headline strip, one schedule (Committed vs Projected
// with manual one-offs inline + editable), and a "Received this year" area —
// replacing the old split of a read-only schedule above a parallel
// manual-commitments ledger that didn't visibly relate.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RevenueScheduleRow } from "@/lib/finance/schedule";

export type Commitment = {
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

export type ReceivedGift = { id: string; label: string; date: string; amount: number };

const SOURCE_TYPES: Array<Commitment["source_type"]> = [
  "foundation", "individual", "corporate", "government", "accelerator", "earned", "other",
];

const SOURCE_LABEL: Record<string, string> = {
  pledge: "Pledge", grant: "Grant", pipeline: "Pipeline", commitment: "Commitment", manual: "Manual",
};
const SOURCE_CHIP: Record<string, string> = {
  pledge: "bg-revenue-bg text-revenue border-revenue/30",
  grant: "bg-orange/15 text-orange border-orange/30",
  pipeline: "bg-tile text-ink-2 border-outline",
  commitment: "bg-revenue-bg text-revenue border-revenue/30",
  manual: "bg-[#EFE6D4] text-ink-1 border-outline",
};

function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
const monthLabel = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
const dayLabel = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const inputCls = "w-full bg-ink border-[1.5px] border-outline rounded px-2 py-1.5 text-sm text-ink-1";

export default function RevenueManager({
  year,
  goal,
  scheduleRows,
  commitments,
  receivedGifts,
  receivedGiftsTotal,
}: {
  year: number;
  goal: number;
  scheduleRows: RevenueScheduleRow[];
  commitments: Commitment[];
  receivedGifts: ReceivedGift[];
  receivedGiftsTotal: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [src, setSrc] = useState<Commitment["source_type"]>("foundation");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [stat, setStat] = useState<Commitment["status"]>("secured");
  const [prob, setProb] = useState("");
  const [date, setDate] = useState("");
  const [restricted, setRestricted] = useState(false);
  const [restrictedTo, setRestrictedTo] = useState("");

  // ── Derived numbers (computed once) ────────────────────────────────────────
  const committedRows = [...scheduleRows]
    .filter((r) => r.confidence === "committed")
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  const projectedRows = [...scheduleRows]
    .filter((r) => r.confidence === "projected")
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  const committedTotal = committedRows.reduce((s, r) => s + r.gross_amount, 0);
  const projectedTotal = projectedRows.reduce((s, r) => s + r.weighted_amount, 0);

  // Received money = the gifts ledger only (the single source of truth). A
  // "received" manual commitment duplicates its eventual gift, so it isn't
  // counted or listed here — record landed money as a gift.
  const totalReceived = receivedGiftsTotal;

  const hard = totalReceived + committedTotal;
  const goalPct = goal > 0 ? (hard / goal) * 100 : 0;
  const goalPctProj = goal > 0 ? ((hard + projectedTotal) / goal) * 100 : 0;

  // ── Manual-commitment CRUD (shared add/edit form) ──────────────────────────
  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setSrc("foundation"); setName(""); setAmount(""); setStat("secured");
    setProb(""); setDate(""); setRestricted(false); setRestrictedTo("");
    setError(null);
  }
  function startAdd() {
    resetForm();
    setFormOpen(true);
  }
  function startEdit(c: Commitment) {
    setEditingId(c.id);
    setSrc(c.source_type);
    setName(c.source_name);
    setAmount(String(c.amount));
    setStat(c.status);
    setProb(c.probability === null ? "" : String(Math.round(c.probability * 100)));
    setDate(c.expected_date ?? "");
    setRestricted(c.restricted);
    setRestrictedTo(c.restricted_to ?? "");
    setError(null);
    setFormOpen(true);
  }
  async function save() {
    if (!name.trim() || !amount) {
      setError("Source name and amount are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const fields = {
      source_type: src,
      source_name: name.trim(),
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
    resetForm();
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this commitment?")) return;
    setBusy(true);
    await fetch(`/api/admin/finance/revenue/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  // A schedule row's editable manual commitment (by id), else null.
  const manualFor = (r: RevenueScheduleRow) =>
    r.source_type === "manual" ? commitments.find((c) => c.id === r.source_id) ?? null : null;

  const scheduleRow = (r: RevenueScheduleRow) => {
    const manual = manualFor(r);
    return (
      <li
        key={`${r.source_type}-${r.source_id}`}
        className="grid grid-cols-[5.5rem_1fr_auto] sm:grid-cols-[6rem_7rem_1fr_auto_auto] items-center gap-3 py-2 text-sm"
      >
        <span className="font-mono text-xs text-ink-2">{monthLabel(r.month)}</span>
        <span className="hidden sm:block">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${SOURCE_CHIP[r.source_type] ?? SOURCE_CHIP.manual}`}>
            {SOURCE_LABEL[r.source_type] ?? r.source_type}
          </span>
        </span>
        <span className="min-w-0 truncate text-ink-1" title={r.label}>
          {r.label}
          {r.needs_schedule && (
            <span className="ml-2 text-[10px] text-[#A56A1B]" title="Awarded but not tranched — counted as a lump at the period start">
              needs schedule
            </span>
          )}
          {r.restricted && (
            <span className="ml-2 text-[10px] text-[#A56A1B]">
              restricted{r.restricted_to ? ` · ${r.restricted_to}` : ""}
            </span>
          )}
        </span>
        <span className="text-right font-mono [font-variant-numeric:tabular-nums]">
          {r.confidence === "committed" ? (
            <span className="text-ink-1">{money(r.gross_amount)}</span>
          ) : (
            <span className="text-ink-2" title={`${money(r.gross_amount)} ask, weighted`}>{money(r.weighted_amount)}</span>
          )}
        </span>
        <span className="text-right whitespace-nowrap">
          {manual ? (
            <>
              <button onClick={() => startEdit(manual)} className="text-[11px] text-ink-2 hover:text-orange mr-2">Edit</button>
              <button onClick={() => void remove(manual.id)} className="text-[11px] text-ink-2 hover:text-expense">Delete</button>
            </>
          ) : (
            <span className="text-[10px] text-ink-3">auto</span>
          )}
        </span>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Headline strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Received" value={money(totalReceived)} sub="landed this year" accent />
        <Stat label="Committed" value={money(committedTotal)} sub="signed, not yet in" accent />
        <Stat label="Projected" value={money(projectedTotal)} sub="pipeline, weighted" />
        <Stat
          label={`Toward ${money(goal)} goal`}
          value={`${goalPct.toFixed(0)}%`}
          sub={goal > 0 ? `${goalPctProj.toFixed(0)}% with pipeline` : "set a goal in Config"}
        />
      </div>

      {goal > 0 && (
        <div>
          <div className="relative h-6 rounded-full bg-tile overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-orange/25" style={{ width: `${Math.min(100, goalPctProj)}%` }} />
            <div className="absolute inset-y-0 left-0 bg-orange" style={{ width: `${Math.min(100, goalPct)}%` }} />
          </div>
          <div className="mt-1.5 text-[11px] text-ink-2">
            {money(hard)} received + committed toward {money(goal)} goal
          </div>
        </div>
      )}

      {/* ── Expected inflows ───────────────────────────────────────────── */}
      <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <h2 className="font-heading font-bold text-ink-1 text-lg">Expected inflows</h2>
          {!formOpen && (
            <button onClick={startAdd} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors">
              + Add commitment
            </button>
          )}
        </div>
        <p className="text-xs text-ink-2 mb-4">
          Dated money still to come — committed at full value, pipeline weighted by probability.
          Grants, pledges and pipeline flow in automatically; rows tagged <b>Manual</b> are one-offs
          you added here. Received money is below.
        </p>

        {formOpen && (
          <div className="rounded-card border-[1.5px] border-orange/40 bg-surface p-4 mb-5">
            <div className="text-[11px] uppercase tracking-wider text-ink-2 font-medium mb-3">
              {editingId ? "Edit commitment" : "New manual commitment"}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Source type">
                <select value={src} onChange={(e) => setSrc(e.target.value as Commitment["source_type"])} className={inputCls}>
                  {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Source name">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mott Foundation" className={inputCls} />
              </Field>
              <Field label="Amount ($)">
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="50000" className={inputCls} />
              </Field>
              <Field label="Status">
                <select value={stat} onChange={(e) => setStat(e.target.value as Commitment["status"])} className={inputCls}>
                  <option value="secured">Secured</option>
                  <option value="projected">Projected</option>
                </select>
              </Field>
              <Field label="Probability % (projected only)">
                <input value={prob} onChange={(e) => setProb(e.target.value)} inputMode="decimal" placeholder="50" className={inputCls} />
              </Field>
              <Field label="Expected date">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Restricted?">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} className="accent-orange" />
                  {restricted && (
                    <input value={restrictedTo} onChange={(e) => setRestrictedTo(e.target.value)} placeholder="restricted to…" className={inputCls} />
                  )}
                </div>
              </Field>
            </div>
            {error && <p className="mt-3 text-xs text-expense">{error}</p>}
            <div className="mt-4 flex items-center gap-2">
              <button disabled={busy || !name || !amount} onClick={save}
                className="px-3 py-1.5 rounded-lg bg-orange hover:bg-orange-dark text-white text-sm font-medium disabled:opacity-40">
                {busy ? "Saving…" : editingId ? "Save changes" : "Add commitment"}
              </button>
              <button onClick={resetForm} className="px-3 py-1.5 rounded-lg text-ink-2 hover:text-ink-1 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {committedRows.length === 0 && projectedRows.length === 0 ? (
          <div className="text-sm text-ink-2 py-6 text-center border border-dashed border-outline rounded-card">
            No dated inflows yet. Awarded grants, scheduled pledges, and weighted pipeline appear here
            once they have an amount and a date.
          </div>
        ) : (
          <>
            {committedRows.length > 0 && (
              <div id="committed" className="scroll-mt-24 mt-5 pt-3 border-t border-outline">
                <GroupHeader label="Committed" sub="grants, pledges & signed commitments — full value" total={money(committedTotal)} />
                <ul className="divide-y divide-hairline">{committedRows.map(scheduleRow)}</ul>
              </div>
            )}
            {projectedRows.length > 0 && (
              <div id="projected" className="scroll-mt-24 mt-5 pt-3 border-t border-outline">
                <GroupHeader label="Projected pipeline" sub="open asks, weighted by probability — not committed yet" total={money(projectedTotal)} muted />
                <ul className="divide-y divide-hairline">{projectedRows.map(scheduleRow)}</ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Received this year ─────────────────────────────────────────── */}
      <section id="received" className="scroll-mt-24 rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="font-heading font-bold text-ink-1 text-lg">Received this year</h2>
          <span className="text-xs font-mono text-revenue [font-variant-numeric:tabular-nums]">{money(totalReceived)}</span>
        </div>
        <p className="text-xs text-ink-2 mb-4">
          Money that has landed in {year} — gifts from the ledger (the canonical record of
          received money; HubSpot closed-won and manual gifts both land here).
        </p>
        {receivedGifts.length === 0 ? (
          <div className="text-sm text-ink-2 py-6 text-center border border-dashed border-outline rounded-card">
            Nothing received yet this year.
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {receivedGifts.map((g) => (
              <li key={`gift-${g.id}`} className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 py-2 text-sm">
                <span className="font-mono text-xs text-ink-2">{dayLabel(g.date)}</span>
                <span className="min-w-0 truncate text-ink-1" title={g.label}>{g.label}</span>
                <span className="text-right font-mono text-revenue [font-variant-numeric:tabular-nums]">{money(g.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel p-3">
      <div className="text-[10px] uppercase tracking-widest text-ink-2 mb-1">{label}</div>
      <div className={`text-lg font-medium ${accent ? "text-orange" : "text-ink-1"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-ink-2">{sub}</div>}
    </div>
  );
}

// Group separation (top margin/border) lives on the anchored wrapper divs
// above, so each group can be a scroll target for the Strategy Narrative.
function GroupHeader({ label, sub, total, muted }: { label: string; sub: string; total: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-1">
      <div>
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${muted ? "text-ink-2" : "text-ink-1"}`}>{label}</span>
        <span className="ml-2 text-[11px] text-ink-2">{sub}</span>
      </div>
      <span className={`text-xs font-mono [font-variant-numeric:tabular-nums] ${muted ? "text-ink-2" : "text-ink-1"}`}>{total}</span>
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
