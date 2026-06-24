"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Unassigned vital signs (Phase C): live registry metrics not yet attached to a
// goal. Each is either proving a goal or parked here pending a decision — a
// growing tray is debt to clean up, not an error. "Attach" binds the metric to a
// goal as an auto measure (source='auto'), so it starts refreshing in context.

export type UnassignedMetric = { key: string; label: string; unit: string; value: number | null };
type GoalOption = { id: string; title: string; objectiveTitle: string | null };

function fmt(value: number | null, unit: string): string {
  if (value == null) return "—";
  if (unit === "$") return Math.abs(value) >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value.toLocaleString()}`;
  if (unit === "%") return `${Math.round(value)}%`;
  return value.toLocaleString();
}

export default function UnassignedMetrics({
  metrics,
  goals,
}: {
  metrics: UnassignedMetric[];
  goals: GoalOption[];
}) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [goalId, setGoalId] = useState("");
  const [busy, setBusy] = useState(false);

  if (metrics.length === 0) return null;

  const attach = async (m: UnassignedMetric) => {
    if (!goalId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/plan/kpis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_id: goalId,
          title: m.label,
          unit: m.unit || undefined,
          source: "auto",
          metric_key: m.key,
          current: m.value ?? undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setOpenKey(null);
      setGoalId("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-card-lg border-[1.5px] border-dashed border-outline bg-surface p-5 mb-8">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Unassigned vital signs</h2>
        <span className="text-[11px] text-ink-3">{metrics.length} not attached to a goal</span>
      </div>
      <p className="text-[11px] text-ink-3 mb-3">Live metrics with no home yet — attach each to the goal it proves.</p>

      <ul className="divide-y divide-hairline">
        {metrics.map((m) => (
          <li key={m.key} className="py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-sm text-ink-1 flex-1 min-w-0 truncate">{m.label}</span>
              <span className="text-xs text-ink-2 tabular-nums shrink-0">{fmt(m.value, m.unit)}</span>
              <button
                type="button"
                onClick={() => setOpenKey(openKey === m.key ? null : m.key)}
                disabled={goals.length === 0}
                title={goals.length === 0 ? "Add a goal first" : undefined}
                className="text-[11px] font-semibold text-orange hover:text-orange-dark shrink-0 disabled:text-ink-3 disabled:cursor-not-allowed"
              >
                {openKey === m.key ? "Cancel" : "Attach →"}
              </button>
            </div>
            {openKey === m.key && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <select
                  className="bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1 text-xs text-ink-1 cursor-pointer focus:outline-none focus:border-orange/40 flex-1 min-w-[200px]"
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                >
                  <option value="" disabled>Attach to goal…</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}{g.objectiveTitle ? ` · ${g.objectiveTitle}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void attach(m)}
                  disabled={busy || !goalId}
                  className="text-[11px] bg-orange hover:bg-orange-dark text-white px-3 py-1 rounded-lg disabled:opacity-50"
                >
                  Attach
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
