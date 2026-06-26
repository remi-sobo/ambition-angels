"use client";

// KPI scorecard card. Anatomy: headline value vs target, % progress, paced RAG
// status, trend sparkline, freshness, the goal → objective cascade — plus
// provenance (where the number comes from) and inline editing of the current
// value for manual measures. Editing PATCHes /api/admin/plan/kpis/[id], which
// stamps last_updated_at and snapshots the value, then we refresh — so the same
// edit shows on the Strategic Plan front page and the Strategy Narrative (all
// read plan_kpis live). One source, three surfaces.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { kpiProvenance } from "@/lib/admin/plan/provenance";

export type ScorecardKpi = {
  id: string;
  title: string;
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
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = val.trim() === "" ? null : Number(val);
    if (n !== null && !Number.isFinite(n)) {
      alert("Enter a number");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/plan/kpis/${kpi.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: n }),
      });
      if (!res.ok) {
        alert("Could not save");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
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
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <button onClick={() => void save()} className="text-revenue text-lg leading-none" aria-label="Save">✓</button>
            <button onClick={() => setEditing(false)} className="text-ink-3 text-lg leading-none" aria-label="Cancel">✕</button>
          </span>
        ) : (
          <div className="flex items-baseline gap-1.5">
            {prov.editable ? (
              <button
                onClick={() => {
                  setVal(kpi.current?.toString() ?? "");
                  setEditing(true);
                }}
                className="group flex items-baseline gap-1 text-2xl font-bold text-ink-1 tabular-nums leading-none hover:text-orange transition-colors"
                title="Click to update this measure"
              >
                {fmtVal(kpi.current, kpi.unit)}
                <span className="text-[11px] text-ink-3 group-hover:text-orange">✎</span>
              </button>
            ) : (
              <span className="text-2xl font-bold text-ink-1 tabular-nums leading-none">{fmtVal(kpi.current, kpi.unit)}</span>
            )}
            {kpi.target !== null && <span className="text-xs text-ink-3 tabular-nums">/ {fmtVal(kpi.target, kpi.unit)}</span>}
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
        <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${h.pill}`}>{h.label}</span>
        {delta !== null && delta !== 0 && (
          <span className={`text-[10px] font-semibold tabular-nums ${delta > 0 ? "text-revenue" : "text-expense"}`}>
            {delta > 0 ? "▲" : "▼"} {fmtVal(Math.abs(delta), kpi.unit)} since start
          </span>
        )}
        <span className="text-[10px] text-ink-3 ml-auto">{freshness(kpi.lastUpdatedAt)}</span>
      </div>

      {/* Provenance — where this number comes from. */}
      <div className="text-[10px] text-ink-3 leading-snug border-t border-hairline pt-2 flex items-start gap-1">
        <span aria-hidden>{prov.editable ? "✎" : "⟳"}</span>
        <span className="min-w-0">{prov.detail}</span>
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
