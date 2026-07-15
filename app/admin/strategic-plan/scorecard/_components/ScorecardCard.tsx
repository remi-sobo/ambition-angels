"use client";

// KPI scorecard card. Anatomy: headline value vs target, % progress, paced RAG
// status, trend sparkline, freshness, the goal → objective cascade — plus
// provenance (where the number comes from) and in-place editing. The scorecard
// is the working surface: manual values, status, owner, and notes all edit here
// via PATCH /api/admin/plan/kpis/[id] (which stamps last_updated_at and
// snapshots value changes), then we refresh — so the same edit shows on the
// Strategic Plan front page and the Strategy Narrative (all read plan_kpis
// live). One source, three surfaces. Structural editing (add/delete measures,
// targets, baselines) stays on the plan.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { kpiProvenance } from "@/lib/admin/plan/provenance";

export type ScorecardKpi = {
  id: string;
  title: string;
  owner: string | null;
  notes: string | null;
  unit: string | null;
  target: number | null;
  current: number | null;
  status: string;
  source: string;
  metricKey: string | null;
  lastUpdatedAt: string | null;
  goalTitle: string | null;
  objectiveTitle: string | null;
  history: number[];
};

const HEALTH: Record<string, { label: string; bar: string; pill: string }> = {
  on_track: { label: "On track", bar: "bg-revenue", pill: "bg-revenue-bg text-revenue" },
  done: { label: "Met", bar: "bg-revenue", pill: "bg-revenue-bg text-revenue" },
  at_risk: { label: "At risk", bar: "bg-[#C8881B]", pill: "bg-[#F4E8D0] text-[#A56A1B]" },
  behind: { label: "Behind", bar: "bg-expense", pill: "bg-expense-bg text-expense" },
  not_started: { label: "Not started", bar: "bg-gray-mid", pill: "bg-tile text-ink-2" },
};
const STATUS_ORDER = ["not_started", "on_track", "at_risk", "behind", "done"] as const;

function fmtVal(v: number | null, unit: string | null): string {
  if (v === null || v === undefined) return "—";
  if (unit === "$" || unit === "usd") {
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
    return `$${v.toLocaleString()}`;
  }
  if (unit === "%" || unit === "percent") return `${Math.round(v)}%`;
  return v.toLocaleString();
}

function freshness(iso: string | null): string {
  if (!iso) return "never updated";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "updated today";
  if (days === 1) return "updated 1d ago";
  if (days < 30) return `updated ${days}d ago`;
  return `updated ${Math.round(days / 30)}mo ago`;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 96, h = 26, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [lx, ly] = pts[pts.length - 1].split(",");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-24 h-6 text-orange shrink-0" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="1.8" fill="currentColor" />
    </svg>
  );
}

export default function ScorecardCard({ kpi }: { kpi: ScorecardKpi }) {
  const router = useRouter();
  const prov = kpiProvenance(kpi.source, kpi.metricKey);
  const h = HEALTH[kpi.status] ?? HEALTH.not_started;
  const pct =
    kpi.target && kpi.target > 0 && kpi.current !== null
      ? Math.max(0, Math.min(100, Math.round((kpi.current / kpi.target) * 100)))
      : null;
  const delta = kpi.history.length >= 2 ? kpi.history[kpi.history.length - 1] - kpi.history[0] : null;

  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(kpi.current?.toString() ?? "");
  const [editingOwner, setEditingOwner] = useState(false);
  const [ownerVal, setOwnerVal] = useState(kpi.owner ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesVal, setNotesVal] = useState(kpi.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One PATCH path for every field on the card; failures surface inline with
  // the actual reason (a 403 here means the account lacks org.manage).
  const patch = async (fields: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/plan/kpis/${kpi.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        setError(
          res.status === 403
            ? "Your account can't edit measures — ask an admin for the manage permission."
            : `Could not save (${(await res.json().catch(() => ({} as { error?: string }))).error ?? `HTTP ${res.status}`}).`
        );
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Could not save — check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveVal = async () => {
    const n = val.trim() === "" ? null : Number(val);
    if (n !== null && !Number.isFinite(n)) {
      setError("Enter a number.");
      return;
    }
    if (await patch({ current: n })) setEditing(false);
  };
  const saveOwner = async () => {
    if (await patch({ owner: ownerVal.trim() || null })) setEditingOwner(false);
  };
  const saveNotes = async () => {
    if (await patch({ notes: notesVal.trim() || null })) setEditingNotes(false);
  };

  return (
    <div className={`bg-surface border-[1.5px] border-outline rounded-card p-4 flex flex-col gap-2.5 ${busy ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm font-heading font-semibold text-ink-1 leading-snug flex-1 min-w-0">{kpi.title}</span>
        <span
          className={`text-[9px] uppercase tracking-wide rounded px-1 py-0.5 shrink-0 ${
            prov.editable ? "text-ink-3 bg-tile" : "text-revenue bg-revenue-bg"
          }`}
        >
          {prov.label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        {editing ? (
          <span className="flex items-center gap-1">
            <input
              autoFocus
              inputMode="decimal"
              className="w-24 rounded-md border border-outline bg-app px-2 py-1 text-lg font-bold tabular-nums text-ink-1 focus:outline-none focus:border-orange"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveVal();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <button onClick={() => void saveVal()} className="text-revenue text-lg leading-none" aria-label="Save">✓</button>
            <button onClick={() => setEditing(false)} className="text-ink-3 text-lg leading-none" aria-label="Cancel">✕</button>
          </span>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-ink-1 tabular-nums leading-none">{fmtVal(kpi.current, kpi.unit)}</span>
            {kpi.target !== null && <span className="text-xs text-ink-3 tabular-nums">/ {fmtVal(kpi.target, kpi.unit)}</span>}
            {prov.editable && (
              <button
                onClick={() => {
                  setVal(kpi.current?.toString() ?? "");
                  setEditing(true);
                }}
                className="text-[10px] font-semibold text-orange bg-orange/10 hover:bg-orange/20 rounded-full px-2 py-0.5 transition-colors"
                title="Update this measure's value"
              >
                ✎ Update
              </button>
            )}
          </div>
        )}
        <Sparkline values={kpi.history} />
      </div>

      {pct !== null ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-tile overflow-hidden">
            <div className={`h-full ${h.bar} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-ink-2 tabular-nums w-9 text-right">{pct}%</span>
        </div>
      ) : (
        <div className="h-1.5" />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={kpi.status}
          onChange={(e) => void patch({ status: e.target.value })}
          title="Set this measure's status"
          className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border-0 cursor-pointer ${h.pill}`}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s} className="bg-surface text-ink-1">{HEALTH[s].label}</option>
          ))}
        </select>
        {delta !== null && delta !== 0 && (
          <span className={`text-[10px] font-semibold tabular-nums ${delta > 0 ? "text-revenue" : "text-expense"}`}>
            {delta > 0 ? "▲" : "▼"} {fmtVal(Math.abs(delta), kpi.unit)} since start
          </span>
        )}
        <span className="text-[10px] text-ink-3 ml-auto">{freshness(kpi.lastUpdatedAt)}</span>
      </div>

      {/* Notes — the "why" next to the number: context, blockers, expected movement. */}
      {editingNotes ? (
        <span className="flex items-start gap-1">
          <textarea
            autoFocus
            rows={2}
            className="flex-1 rounded-md border border-outline bg-app px-2 py-1 text-xs text-ink-1 focus:outline-none focus:border-orange"
            value={notesVal}
            placeholder="What's behind this number?"
            onChange={(e) => setNotesVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditingNotes(false);
            }}
          />
          <button onClick={() => void saveNotes()} className="text-revenue text-lg leading-none" aria-label="Save note">✓</button>
          <button onClick={() => setEditingNotes(false)} className="text-ink-3 text-lg leading-none" aria-label="Cancel note">✕</button>
        </span>
      ) : (
        <button
          onClick={() => {
            setNotesVal(kpi.notes ?? "");
            setEditingNotes(true);
          }}
          className="text-left text-[11px] leading-snug hover:underline decoration-dotted underline-offset-2"
          title="Click to edit the note"
        >
          {kpi.notes ? (
            <span className="text-ink-2 whitespace-pre-wrap">{kpi.notes}</span>
          ) : (
            <span className="text-ink-3 italic">+ add note</span>
          )}
        </button>
      )}

      {error && <p className="text-[11px] text-expense">{error}</p>}

      {/* Provenance — where this number comes from — and who owns the measure. */}
      <div className="text-[10px] text-ink-3 leading-snug border-t border-hairline pt-2 flex items-start gap-1">
        <span aria-hidden>{prov.editable ? "✎" : "⟳"}</span>
        <span className="min-w-0 flex-1">{prov.detail}</span>
        {editingOwner ? (
          <span className="flex items-center gap-1 shrink-0">
            <input
              autoFocus
              className="w-20 rounded-md border border-outline bg-app px-1.5 py-0.5 text-[10px] text-ink-1 focus:outline-none focus:border-orange"
              value={ownerVal}
              placeholder="owner"
              onChange={(e) => setOwnerVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveOwner();
                if (e.key === "Escape") setEditingOwner(false);
              }}
            />
            <button onClick={() => void saveOwner()} className="text-revenue leading-none" aria-label="Save owner">✓</button>
          </span>
        ) : (
          <button
            onClick={() => {
              setOwnerVal(kpi.owner ?? "");
              setEditingOwner(true);
            }}
            className="shrink-0 hover:text-orange hover:underline decoration-dotted underline-offset-2"
            title="Reassign this measure"
          >
            {kpi.owner ? `→ ${kpi.owner}` : "+ owner"}
          </button>
        )}
      </div>

      {(kpi.goalTitle || kpi.objectiveTitle) && (
        <div
          className="text-[10px] text-ink-3 truncate"
          title={`${kpi.goalTitle ?? ""}${kpi.objectiveTitle ? ` · ${kpi.objectiveTitle}` : ""}`}
        >
          ↳ {kpi.goalTitle ?? "—"}{kpi.objectiveTitle ? ` · ${kpi.objectiveTitle}` : ""}
        </div>
      )}
    </div>
  );
}
