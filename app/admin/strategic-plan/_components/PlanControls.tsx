"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ── Types (mirror the plan_* tables) ──────────────────────────────────────
export type PlanFoundation = {
  mission: string | null;
  vision: string | null;
  values: string[];
  behaviors: string[];
} | null;

export type PlanObjective = {
  id: string;
  title: string;
  three_year_statement: string | null;
  owner: string | null;
  status: string;
  sort_order: number;
};

export type PlanGoal = {
  id: string;
  objective_id: string | null;
  title: string;
  description: string | null;
  target_date: string | null;
  owner: string | null;
  status: string;
};

export type PlanKpi = {
  id: string;
  goal_id: string | null;
  objective_id: string | null;
  title: string;
  unit: string | null;
  target: number | null;
  current: number | null;
  owner: string | null;
  source: string; // 'auto' | 'manual'
  metric_key: string | null;
  status: string;
};

export type PlanInitiative = {
  id: string;
  goal_id: string;
  title: string;
  owner: string | null;
  status: string; // 'todo' | 'in_progress' | 'done'
};

// Phase 2 cascade: rolled-up work from ops projects attached to an initiative.
export type InitiativeRollup = { projects: number; tasksDone: number; tasksTotal: number };

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

// Health scale (objective / goal / KPI).
const HEALTH_STYLES: Record<string, string> = {
  not_started: "bg-tile text-ink-2",
  on_track: "bg-revenue-bg text-revenue",
  at_risk: "bg-[#F4E8D0] text-[#A56A1B]",
  behind: "bg-expense-bg text-expense",
  done: "bg-tile text-ink-2",
};
const HEALTH_LABELS: Record<string, string> = {
  not_started: "Not started",
  on_track: "On track",
  at_risk: "At risk",
  behind: "Behind",
  done: "Done",
};
// Goals keep the four-value health scale they shipped with.
const GOAL_LABELS: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  behind: "Behind",
  done: "Done",
};

const fmtVal = (v: number | null, unit: string | null): string => {
  if (v === null || v === undefined) return "—";
  if (unit === "$")
    return v >= 1000
      ? `$${Math.round(v / 1000)}k`
      : `$${v.toLocaleString()}`;
  return `${v.toLocaleString()}${unit && unit !== "%" ? "" : unit === "%" ? "%" : ""}`;
};

async function api(url: string, method: string, body?: unknown): Promise<boolean> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    alert(j.error ?? `HTTP ${res.status}`);
    return false;
  }
  return true;
}

// ── Seed button (one-time AA strategy load) ────────────────────────────────
export function SeedButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        if (!confirm("Load Ambition Angels' strategy (foundation, 4 objectives, goals, KPIs)? Safe to run once.")) return;
        setBusy(true);
        try {
          const res = await fetch("/api/admin/plan/seed", { method: "POST" });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) alert(j.error ?? `HTTP ${res.status}`);
          else if (j.seeded === false) alert("Strategy already seeded.");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
    >
      {busy ? "Loading…" : "Load AA strategy"}
    </button>
  );
}

// ── Refresh auto metrics (Phase 3) ─────────────────────────────────────────
export function RefreshMetricsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      title="Recompute auto KPIs (grants, corporate, donor updates, active teens) from live data"
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/admin/plan/kpis/refresh", { method: "POST" });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) alert(j.error ?? `HTTP ${res.status}`);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] px-4 py-2 rounded-full transition-colors disabled:opacity-50"
    >
      {busy ? "Refreshing…" : "↻ Refresh metrics"}
    </button>
  );
}

// Roll a set of KPI statuses up to a single health by exception (worst wins).
// null = nothing measurable yet.
export function deriveHealth(statuses: string[]): string | null {
  if (statuses.some((s) => s === "behind")) return "behind";
  if (statuses.some((s) => s === "at_risk")) return "at_risk";
  if (statuses.some((s) => s === "on_track" || s === "done")) return "on_track";
  return null;
}

function RollupChip({ health }: { health: string | null }) {
  if (!health) return null;
  return (
    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${HEALTH_STYLES[health] ?? "bg-tile text-ink-2"}`}>
      measures: {HEALTH_LABELS[health] ?? health}
    </span>
  );
}

// ── Foundation (mission / vision / values / behaviors) ─────────────────────
export function FoundationPanel({ foundation }: { foundation: PlanFoundation }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mission, setMission] = useState(foundation?.mission ?? "");
  const [vision, setVision] = useState(foundation?.vision ?? "");
  const [values, setValues] = useState((foundation?.values ?? []).join(", "));
  const [behaviors, setBehaviors] = useState((foundation?.behaviors ?? []).join(", "));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ok = await api("/api/admin/plan/foundation", "PUT", { mission, vision, values, behaviors });
      if (ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <form onSubmit={save} className={`bg-surface border-[1.5px] border-outline rounded-card p-5 mb-6 space-y-3 ${busy ? "opacity-60" : ""}`}>
        <label className="block text-xs text-ink-2">Mission
          <textarea className={`${inputCls} w-full mt-1`} rows={2} value={mission} onChange={(e) => setMission(e.target.value)} />
        </label>
        <label className="block text-xs text-ink-2">Vision
          <textarea className={`${inputCls} w-full mt-1`} rows={2} value={vision} onChange={(e) => setVision(e.target.value)} />
        </label>
        <label className="block text-xs text-ink-2">Values (comma-separated)
          <input className={`${inputCls} w-full mt-1`} value={values} onChange={(e) => setValues(e.target.value)} />
        </label>
        <label className="block text-xs text-ink-2">Behaviors (comma-separated)
          <input className={`${inputCls} w-full mt-1`} value={behaviors} onChange={(e) => setBehaviors(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-2 hover:text-ink-1 px-2">Cancel</button>
        </div>
      </form>
    );
  }

  const empty = !foundation || (!foundation.mission && !foundation.vision && foundation.values.length === 0);
  return (
    <section className="bg-surface border-[1.5px] border-outline rounded-card p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-heading font-semibold text-ink-1 flex-1">Foundation</h2>
        <button onClick={() => setEditing(true)} className="text-[11px] text-ink-2 hover:text-orange">Edit</button>
      </div>
      {empty ? (
        <p className="text-sm text-ink-2">Mission, vision, values, and behaviors — the culture home. Add them, or load the AA strategy above.</p>
      ) : (
        <div className="space-y-3 text-sm">
          {foundation!.mission && (
            <div><span className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Mission</span><p className="text-ink-1 mt-0.5">{foundation!.mission}</p></div>
          )}
          {foundation!.vision && (
            <div><span className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Vision</span><p className="text-ink-1 mt-0.5">{foundation!.vision}</p></div>
          )}
          <div className="flex flex-wrap gap-4">
            {foundation!.values.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <span className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Values</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {foundation!.values.map((v) => <span key={v} className="text-[11px] bg-tile text-ink-1 rounded-full px-2 py-0.5">{v}</span>)}
                </div>
              </div>
            )}
            {foundation!.behaviors.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <span className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Behaviors</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {foundation!.behaviors.map((v) => <span key={v} className="text-[11px] bg-tile text-ink-1 rounded-full px-2 py-0.5">{v}</span>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ── New objective ──────────────────────────────────────────────────────────
export function NewObjectiveForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [stmt, setStmt] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ok = await api("/api/admin/plan/objectives", "POST", {
        title,
        three_year_statement: stmt || undefined,
      });
      if (ok) {
        setTitle(""); setStmt(""); setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors">
        + New objective
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="w-full bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-4 flex flex-wrap items-end gap-3">
      <label className="flex-1 min-w-[240px] text-xs text-ink-2">Objective
        <input className={`${inputCls} w-full mt-1`} value={title} required autoFocus placeholder="Execute an effective and efficient fundraising strategy" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="flex-1 min-w-[240px] text-xs text-ink-2">3-year statement
        <input className={`${inputCls} w-full mt-1`} value={stmt} placeholder="Where this needs to be in 3 years" onChange={(e) => setStmt(e.target.value)} />
      </label>
      <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full disabled:opacity-50">
        {busy ? "Saving…" : "Create"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-2 hover:text-ink-1 px-2">Cancel</button>
    </form>
  );
}

// ── Objective card (wraps its goals) ───────────────────────────────────────
export function ObjectiveCard({
  objective,
  goals,
  kpisByGoal,
  initiativesByGoal,
  rollups = {},
}: {
  objective: PlanObjective;
  goals: PlanGoal[];
  kpisByGoal: Record<string, PlanKpi[]>;
  initiativesByGoal: Record<string, PlanInitiative[]>;
  rollups?: Record<string, InitiativeRollup>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api(`/api/admin/plan/objectives/${objective.id}`, "PATCH", fields);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(`Delete objective “${objective.title}”? Its goals are kept but unlinked.`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/plan/objectives/${objective.id}`, "DELETE");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`border-[1.5px] border-outline rounded-card-lg p-5 bg-tile/40 ${busy ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading font-bold text-ink-1 flex-1 min-w-0 text-lg">{objective.title}</h2>
        <select
          value={objective.status}
          onChange={(e) => void patch({ status: e.target.value })}
          className={`text-[11px] font-semibold rounded-full px-2 py-1 border-0 cursor-pointer ${HEALTH_STYLES[objective.status] ?? "bg-tile text-ink-2"}`}
        >
          {Object.entries(HEALTH_LABELS).map(([k, v]) => (
            <option key={k} value={k} className="bg-surface text-ink-1">{v}</option>
          ))}
        </select>
        <RollupChip health={deriveHealth(goals.flatMap((g) => (kpisByGoal[g.id] ?? []).map((k) => k.status)))} />
        {objective.owner && <span className="text-[11px] text-ink-2">{objective.owner}</span>}
        <button onClick={() => void remove()} className="text-[11px] text-ink-2 hover:text-expense px-1">Delete</button>
      </div>
      {objective.three_year_statement && (
        <p className="text-xs text-ink-2 italic mt-1">3-year · {objective.three_year_statement}</p>
      )}

      <div className="space-y-3 mt-4">
        {goals.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            kpis={kpisByGoal[g.id] ?? []}
            initiatives={initiativesByGoal[g.id] ?? []}
            rollups={rollups}
          />
        ))}
        {goals.length === 0 && <p className="text-xs text-ink-3">No goals under this objective yet.</p>}
        <NewGoalForm objectiveId={objective.id} compact />
      </div>
    </section>
  );
}

// ── New goal (optionally scoped to an objective) ───────────────────────────
export function NewGoalForm({ objectiveId, compact }: { objectiveId?: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ok = await api("/api/admin/plan/goals", "POST", {
        title,
        target_date: targetDate || undefined,
        objective_id: objectiveId,
      });
      if (ok) {
        setTitle(""); setTargetDate(""); setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className={compact
          ? "text-[11px] text-ink-2 hover:text-orange"
          : "text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"}>
        + {compact ? "Add goal" : "New goal"}
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="w-full bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-4 flex flex-wrap items-end gap-3">
      <label className="flex-1 min-w-[240px] text-xs text-ink-2">Goal
        <input className={`${inputCls} w-full mt-1`} value={title} required autoFocus placeholder="Raise $400k+ from foundations and grants" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">Target date
        <input className={`${inputCls} block mt-1`} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </label>
      <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full disabled:opacity-50">
        {busy ? "Saving…" : "Create"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-2 hover:text-ink-1 px-2">Cancel</button>
    </form>
  );
}

// ── Goal card (now carries KPIs + initiatives) ─────────────────────────────
export function GoalCard({
  goal,
  kpis = [],
  initiatives,
  rollups = {},
}: {
  goal: PlanGoal;
  kpis?: PlanKpi[];
  initiatives: PlanInitiative[];
  rollups?: Record<string, InitiativeRollup>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newInit, setNewInit] = useState("");

  const done = initiatives.filter((i) => i.status === "done").length;
  const pct = initiatives.length > 0 ? Math.round((done / initiatives.length) * 100) : 0;

  const patchGoal = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try { await api(`/api/admin/plan/goals/${goal.id}`, "PATCH", fields); router.refresh(); }
    finally { setBusy(false); }
  };
  const addInitiative = async () => {
    if (!newInit.trim()) return;
    setBusy(true);
    try {
      const ok = await api("/api/admin/plan/initiatives", "POST", { title: newInit.trim(), goal_id: goal.id });
      if (ok) { setNewInit(""); router.refresh(); }
    } finally { setBusy(false); }
  };
  const toggleInitiative = async (init: PlanInitiative) => {
    setBusy(true);
    try {
      await api(`/api/admin/plan/initiatives/${init.id}`, "PATCH", { status: init.status === "done" ? "todo" : "done" });
      router.refresh();
    } finally { setBusy(false); }
  };
  const removeGoal = async () => {
    if (!confirm(`Delete goal “${goal.title}” and its initiatives?`)) return;
    setBusy(true);
    try { await api(`/api/admin/plan/goals/${goal.id}`, "DELETE"); router.refresh(); }
    finally { setBusy(false); }
  };

  return (
    <section className={`bg-surface border-[1.5px] border-outline rounded-card p-5 ${busy ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading font-semibold text-ink-1 flex-1 min-w-0">{goal.title}</h3>
        <select
          value={goal.status}
          onChange={(e) => void patchGoal({ status: e.target.value })}
          className={`text-[11px] font-semibold rounded-full px-2 py-1 border-0 cursor-pointer ${HEALTH_STYLES[goal.status] ?? "bg-tile text-ink-2"}`}
        >
          {Object.entries(GOAL_LABELS).map(([k, v]) => (
            <option key={k} value={k} className="bg-surface text-ink-1">{v}</option>
          ))}
        </select>
        {kpis.length > 0 && <RollupChip health={deriveHealth(kpis.map((k) => k.status))} />}
        {goal.owner && <span className="text-[11px] text-ink-2">{goal.owner}</span>}
        {goal.target_date && <span className="text-[11px] text-ink-2 tabular-nums">by {goal.target_date}</span>}
        <button onClick={() => void removeGoal()} className="text-[11px] text-ink-2 hover:text-expense px-1">Delete</button>
      </div>

      {/* KPIs / measures */}
      {kpis.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {kpis.map((k) => <KpiRow key={k.id} kpi={k} />)}
        </div>
      )}
      <NewKpiForm goalId={goal.id} />

      {/* Initiatives */}
      {initiatives.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-tile overflow-hidden">
            <div className="h-full bg-orange transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-ink-2 tabular-nums">{done}/{initiatives.length}</span>
        </div>
      )}
      <ul className="mt-3 space-y-1.5">
        {initiatives.map((i) => {
          const r = rollups[i.id];
          const pctTasks = r && r.tasksTotal > 0 ? Math.round((r.tasksDone / r.tasksTotal) * 100) : null;
          return (
            <li key={i.id} className="text-sm">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void toggleInitiative(i)}
                  className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                    i.status === "done" ? "bg-orange border-orange text-white" : "border-outline text-transparent hover:border-orange/60"
                  }`}
                  aria-label={i.status === "done" ? "Mark not done" : "Mark done"}
                >✓</button>
                <span className={i.status === "done" ? "text-ink-2 line-through" : "text-ink-1"}>{i.title}</span>
                {i.owner && <span className="text-[10px] text-ink-2">· {i.owner}</span>}
              </div>
              {r && r.projects > 0 && (
                <div className="ml-6 mt-1 flex items-center gap-2">
                  <div className="flex-1 max-w-[160px] h-1.5 rounded-full bg-tile overflow-hidden">
                    <div className="h-full bg-orange/70 transition-all" style={{ width: `${pctTasks ?? 0}%` }} />
                  </div>
                  <span className="text-[10px] text-ink-2 tabular-nums">
                    {r.projects} project{r.projects === 1 ? "" : "s"}
                    {r.tasksTotal > 0 ? ` · ${r.tasksDone}/${r.tasksTotal} tasks` : " · no tasks yet"}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2 mt-3">
        <input
          className={`${inputCls} flex-1 !py-1.5 !text-xs`}
          placeholder="Add initiative…"
          value={newInit}
          onChange={(e) => setNewInit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addInitiative(); } }}
        />
        <button onClick={() => void addInitiative()} disabled={busy} className="text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2 px-3 rounded-lg">Add</button>
      </div>
    </section>
  );
}

// ── KPI row (inline current value + status) ────────────────────────────────
function KpiRow({ kpi }: { kpi: PlanKpi }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(kpi.current?.toString() ?? "");

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try { await api(`/api/admin/plan/kpis/${kpi.id}`, "PATCH", fields); router.refresh(); }
    finally { setBusy(false); }
  };
  const saveVal = async () => {
    const n = val.trim() === "" ? null : Number(val);
    if (n !== null && !Number.isFinite(n)) { alert("Enter a number"); return; }
    setEditing(false);
    await patch({ current: n });
  };
  const remove = async () => {
    if (!confirm(`Delete KPI “${kpi.title}”?`)) return;
    setBusy(true);
    try { await api(`/api/admin/plan/kpis/${kpi.id}`, "DELETE"); router.refresh(); }
    finally { setBusy(false); }
  };

  return (
    <div className={`flex items-center gap-2 text-xs bg-tile/60 rounded-lg px-3 py-1.5 ${busy ? "opacity-60" : ""}`}>
      <span className="text-ink-1 flex-1 min-w-0 truncate">{kpi.title}</span>
      {kpi.source === "auto" ? (
        <span className="text-[9px] uppercase tracking-wide text-revenue bg-revenue-bg rounded px-1 py-0.5" title={kpi.metric_key ?? "auto"}>auto</span>
      ) : (
        <span className="text-[9px] uppercase tracking-wide text-ink-3 bg-tile rounded px-1 py-0.5">manual</span>
      )}
      {editing ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            className={`${inputCls} !py-0.5 !px-1.5 !text-xs w-20`}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void saveVal(); if (e.key === "Escape") setEditing(false); }}
          />
          <button onClick={() => void saveVal()} className="text-revenue">✓</button>
        </span>
      ) : (
        <button
          onClick={() => kpi.source === "manual" && setEditing(true)}
          className={`tabular-nums ${kpi.source === "manual" ? "text-ink-1 hover:text-orange" : "text-ink-2 cursor-default"}`}
          title={kpi.source === "manual" ? "Click to update" : "Computed automatically (Phase 3)"}
        >
          {fmtVal(kpi.current, kpi.unit)}
          {kpi.target !== null && <span className="text-ink-3"> / {fmtVal(kpi.target, kpi.unit)}</span>}
        </button>
      )}
      <select
        value={kpi.status}
        onChange={(e) => void patch({ status: e.target.value })}
        className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 border-0 cursor-pointer ${HEALTH_STYLES[kpi.status] ?? "bg-tile text-ink-2"}`}
      >
        {Object.entries(HEALTH_LABELS).map(([k, v]) => (
          <option key={k} value={k} className="bg-surface text-ink-1">{v}</option>
        ))}
      </select>
      <button onClick={() => void remove()} className="text-ink-3 hover:text-expense">×</button>
    </div>
  );
}

// ── New KPI (attached to a goal) ───────────────────────────────────────────
function NewKpiForm({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ok = await api("/api/admin/plan/kpis", "POST", {
        goal_id: goalId,
        title,
        unit: unit || undefined,
        target: target.trim() === "" ? undefined : Number(target),
      });
      if (ok) { setTitle(""); setUnit(""); setTarget(""); setOpen(false); router.refresh(); }
    } finally { setBusy(false); }
  };

  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-[11px] text-ink-2 hover:text-orange mt-2">+ Add measure</button>;
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mt-2 bg-tile/40 rounded-lg p-2">
      <input className={`${inputCls} flex-1 min-w-[180px] !py-1 !text-xs`} placeholder="Measure (e.g. Grants submitted)" value={title} required autoFocus onChange={(e) => setTitle(e.target.value)} />
      <input className={`${inputCls} w-16 !py-1 !text-xs`} placeholder="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <input className={`${inputCls} w-20 !py-1 !text-xs`} placeholder="target" value={target} onChange={(e) => setTarget(e.target.value)} />
      <button type="submit" disabled={busy} className="text-[11px] bg-orange hover:bg-orange-dark text-white px-3 py-1 rounded-lg disabled:opacity-50">Add</button>
      <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-ink-2 px-1">Cancel</button>
    </form>
  );
}
