"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deriveHealth } from "@/lib/admin/plan/health";
import { measureFreshness } from "@/lib/admin/plan/freshness";
import { useTaskComplete } from "@/app/admin/_lib/useTaskComplete";

// ── Types (mirror the plan_* tables) ──────────────────────────────────────
export type PlanFoundation = {
  mission: string | null;
  vision: string | null;
  values: string[];
  behaviors: string[];
  /** Funder-facing proof points shown in the Narrative's proof strip. */
  proof_points: { value: string; label: string }[] | null;
} | null;

export type PlanObjective = {
  id: string;
  title: string;
  three_year_statement: string | null;
  owner: string | null;
  status: string;
  status_override: string | null;
  status_override_reason: string | null;
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
  status_override: string | null;
  status_override_reason: string | null;
};

export type PlanKpi = {
  id: string;
  goal_id: string | null;
  objective_id: string | null;
  title: string;
  unit: string | null;
  target: number | null;
  current: number | null;
  baseline: number | null;
  baseline_date: string | null;
  owner: string | null;
  source: string; // 'auto' | 'manual'
  metric_key: string | null;
  status: string;
  cadence: string | null;
  notes: string | null;
  last_updated_at: string | null;
};

// A bindable auto-metric option (from /api/admin/plan/kpis/metrics).
export type MetricOption = { key: string; label: string; unit: string; value: number | null; bound: boolean };

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

// ── Inline click-to-edit text ──────────────────────────────────────────────
// Renders the value (or a muted placeholder) until clicked, then an input /
// textarea that commits on blur or Enter (Esc cancels). An empty commit saves
// null, so a field can be cleared. The display element inherits `className` so
// each call site keeps its own typography; the editor uses the shared input
// style unless `inputClassName` overrides it. Mirrors the ops project header's
// inline-edit idiom (app/admin/ops/projects/[id]/_components/ProjectHeader).
function EditableText({
  value,
  onSave,
  placeholder = "—",
  multiline = false,
  className = "",
  inputClassName,
  ariaLabel,
}: {
  value: string | null;
  onSave: (next: string | null) => void | Promise<void>;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  // Keep the draft in sync when the underlying value changes (e.g. after a refresh).
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };
  const commit = () => {
    setEditing(false);
    const next = draft.trim() === "" ? null : draft.trim();
    if (next !== (value ?? null)) void onSave(next);
    else setDraft(value ?? "");
  };

  if (editing) {
    const cls = inputClassName ?? `${inputCls} ${multiline ? "w-full" : ""}`;
    if (multiline) {
      return (
        <textarea
          autoFocus
          rows={2}
          aria-label={ariaLabel}
          className={cls}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
        />
      );
    }
    return (
      <input
        autoFocus
        aria-label={ariaLabel}
        className={cls}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") cancel();
        }}
      />
    );
  }

  const has = !!(value && value.trim());
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`text-left hover:underline decoration-dotted underline-offset-2 ${className}`}
      title="Click to edit"
      aria-label={ariaLabel}
    >
      {has ? value : <span className="text-ink-3 font-normal italic">{placeholder}</span>}
    </button>
  );
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

// Status for an objective/goal: computed from its measures by default; a human
// can override, but only with a reason, and the override renders as one (B2-1).
// The chip shows the effective status; the dropdown sets/clears the override.
function StatusOverride({
  entity, id, override, reason, computed, stored,
}: {
  entity: "objectives" | "goals";
  id: string;
  override: string | null;
  reason: string | null;
  computed: string | null;
  stored: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const effective = override ?? computed ?? stored ?? "not_started";
  const set = async (val: string) => {
    let body: Record<string, unknown>;
    if (!val) body = { status_override: null };
    else {
      const r = window.prompt("Why override the computed status? (a funder-grade plan shows the reason)", reason ?? "");
      if (r === null) return; // cancelled
      body = { status_override: val, status_override_reason: r.trim() };
    }
    setBusy(true);
    try { await api(`/api/admin/plan/${entity}/${id}`, "PATCH", body); router.refresh(); }
    finally { setBusy(false); }
  };
  return (
    <span className={`flex items-center gap-1 ${busy ? "opacity-60" : ""}`}>
      <span
        className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${HEALTH_STYLES[effective] ?? "bg-tile text-ink-2"}`}
        title={override ? `Manual override${reason ? `: ${reason}` : ""}` : "Computed from measures"}
      >
        {HEALTH_LABELS[effective] ?? effective}
      </span>
      <select
        value={override ?? ""}
        onChange={(e) => void set(e.target.value)}
        title="Override the computed status"
        className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 border-0 cursor-pointer bg-tile text-ink-2"
      >
        <option value="">Auto</option>
        {Object.entries(HEALTH_LABELS).map(([k, v]) => (
          <option key={k} value={k} className="bg-surface text-ink-1">{v}</option>
        ))}
      </select>
      {override && <span className="text-[9px] uppercase tracking-wide text-status-watch-text" title={reason ?? ""}>override</span>}
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
  // Proof points edit as one "value | label" per line (e.g. "3,500+ | teens reached").
  const [proof, setProof] = useState((foundation?.proof_points ?? []).map((p) => `${p.value} | ${p.label}`).join("\n"));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const proof_points = proof
        .split("\n")
        .map((line) => {
          const i = line.indexOf("|");
          if (i === -1) return { value: line.trim(), label: "" };
          return { value: line.slice(0, i).trim(), label: line.slice(i + 1).trim() };
        })
        .filter((p) => p.value);
      const ok = await api("/api/admin/plan/foundation", "PUT", { mission, vision, values, behaviors, proof_points });
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
        <label className="block text-xs text-ink-2">Proof points — one per line, <span className="text-ink-3">value | label</span> (shown in the funder Narrative)
          <textarea className={`${inputCls} w-full mt-1 font-mono text-[12px]`} rows={4} placeholder={"3,500+ | teens reached\n87% | Title I schools"} value={proof} onChange={(e) => setProof(e.target.value)} />
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
          {(foundation!.proof_points ?? []).length > 0 && (
            <div>
              <span className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold">Proof points <span className="normal-case text-ink-3 font-normal">· shown in the funder Narrative</span></span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {foundation!.proof_points!.map((p) => (
                  <span key={`${p.value}-${p.label}`} className="text-[11px] bg-tile text-ink-1 rounded-full px-2 py-0.5">
                    <strong>{p.value}</strong> {p.label}
                  </span>
                ))}
              </div>
            </div>
          )}
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
  objectiveOptions,
}: {
  objective: PlanObjective;
  goals: PlanGoal[];
  kpisByGoal: Record<string, PlanKpi[]>;
  initiativesByGoal: Record<string, PlanInitiative[]>;
  rollups?: Record<string, InitiativeRollup>;
  /** When passed, goals under this objective get a re-parent dropdown. */
  objectiveOptions?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      if (await api(`/api/admin/plan/objectives/${objective.id}`, "PATCH", fields)) router.refresh();
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
    <section
      id={`objective-${objective.id}`}
      className={`scroll-mt-24 border-[1.5px] border-outline rounded-card-lg p-5 bg-tile/40 ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <EditableText
          value={objective.title}
          onSave={(v) => { if (v) void patch({ title: v }); }}
          ariaLabel="Objective title"
          className="font-heading font-bold text-ink-1 flex-1 min-w-0 text-lg"
        />
        <StatusOverride
          entity="objectives"
          id={objective.id}
          override={objective.status_override}
          reason={objective.status_override_reason}
          computed={deriveHealth(goals.flatMap((g) => (kpisByGoal[g.id] ?? []).map((k) => k.status)))}
          stored={objective.status}
        />
        <EditableText
          value={objective.owner}
          onSave={(v) => patch({ owner: v })}
          placeholder="+ owner"
          ariaLabel="Objective owner"
          className="text-[11px] text-ink-2"
        />
        <button onClick={() => void remove()} className="text-[11px] text-ink-2 hover:text-expense px-1">Delete</button>
      </div>
      <p className="text-xs text-ink-2 italic mt-1">
        <span className="not-italic text-ink-3">3-year · </span>
        <EditableText
          value={objective.three_year_statement}
          onSave={(v) => patch({ three_year_statement: v })}
          placeholder="add a 3-year statement"
          multiline
          ariaLabel="3-year statement"
          className="italic"
          inputClassName={`${inputCls} w-full mt-1 not-italic`}
        />
      </p>

      <div className="space-y-3 mt-4">
        {goals.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            kpis={kpisByGoal[g.id] ?? []}
            initiatives={initiativesByGoal[g.id] ?? []}
            rollups={rollups}
            objectiveOptions={objectiveOptions}
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
  objectiveOptions,
}: {
  goal: PlanGoal;
  kpis?: PlanKpi[];
  initiatives: PlanInitiative[];
  rollups?: Record<string, InitiativeRollup>;
  /** When passed, the goal shows a dropdown to move it to another objective. */
  objectiveOptions?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const { isLeaving, complete } = useTaskComplete();
  const [busy, setBusy] = useState(false);
  const [newInit, setNewInit] = useState("");
  const [showDoneInits, setShowDoneInits] = useState(false);

  const done = initiatives.filter((i) => i.status === "done").length;
  const pct = initiatives.length > 0 ? Math.round((done / initiatives.length) * 100) : 0;
  const openInits = initiatives.filter((i) => i.status !== "done");
  const doneInits = initiatives.filter((i) => i.status === "done");

  const patchGoal = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      if (await api(`/api/admin/plan/goals/${goal.id}`, "PATCH", fields)) router.refresh();
    } finally { setBusy(false); }
  };
  const addInitiative = async () => {
    if (!newInit.trim()) return;
    setBusy(true);
    try {
      const ok = await api("/api/admin/plan/initiatives", "POST", { title: newInit.trim(), goal_id: goal.id });
      if (ok) { setNewInit(""); router.refresh(); }
    } finally { setBusy(false); }
  };
  const patchInit = async (init: PlanInitiative, fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      if (await api(`/api/admin/plan/initiatives/${init.id}`, "PATCH", fields)) router.refresh();
    } finally { setBusy(false); }
  };
  const removeInit = async (init: PlanInitiative) => {
    if (!confirm(`Delete initiative “${init.title}”?`)) return;
    setBusy(true);
    try {
      if (await api(`/api/admin/plan/initiatives/${init.id}`, "DELETE")) router.refresh();
    } finally { setBusy(false); }
  };
  const runToggleInit = async (init: PlanInitiative, status: "todo" | "done") => {
    setBusy(true);
    try {
      await api(`/api/admin/plan/initiatives/${init.id}`, "PATCH", { status });
      router.refresh();
    } finally { setBusy(false); }
  };
  // Checking an initiative off plays the strike → collapse animation, then it
  // drops into the "done" drawer. Un-checking restores it immediately.
  const toggleInitiative = (init: PlanInitiative) => {
    if (init.status === "done") void runToggleInit(init, "todo");
    else complete(init.id, () => runToggleInit(init, "done"));
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
        <EditableText
          value={goal.title}
          onSave={(v) => { if (v) void patchGoal({ title: v }); }}
          ariaLabel="Goal title"
          className="font-heading font-semibold text-ink-1 flex-1 min-w-0"
        />
        <StatusOverride
          entity="goals"
          id={goal.id}
          override={goal.status_override}
          reason={goal.status_override_reason}
          computed={deriveHealth(kpis.map((k) => k.status))}
          stored={goal.status}
        />
        {objectiveOptions && objectiveOptions.length > 0 && (
          <select
            value={goal.objective_id ?? ""}
            onChange={(e) => void patchGoal({ objective_id: e.target.value || null })}
            aria-label="Move goal to objective"
            title="Move to another objective"
            className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 border-0 cursor-pointer bg-tile text-ink-2 max-w-[140px]"
          >
            <option value="">No objective</option>
            {objectiveOptions.map((o) => (
              <option key={o.id} value={o.id} className="bg-surface text-ink-1">{o.title}</option>
            ))}
          </select>
        )}
        <EditableText
          value={goal.owner}
          onSave={(v) => patchGoal({ owner: v })}
          placeholder="+ owner"
          ariaLabel="Goal owner"
          className="text-[11px] text-ink-2"
        />
        <span className="text-[11px] text-ink-2 tabular-nums flex items-center gap-1">
          <span className="text-ink-3">by</span>
          <input
            type="date"
            value={goal.target_date ?? ""}
            onChange={(e) => void patchGoal({ target_date: e.target.value || null })}
            aria-label="Goal target date"
            className="bg-transparent text-[11px] text-ink-2 cursor-pointer focus:outline-none"
          />
        </span>
        <button onClick={() => void removeGoal()} className="text-[11px] text-ink-2 hover:text-expense px-1">Delete</button>
      </div>
      <div className="text-xs text-ink-2 mt-1">
        <EditableText
          value={goal.description}
          onSave={(v) => patchGoal({ description: v })}
          placeholder="+ add a description"
          multiline
          ariaLabel="Goal description"
          inputClassName={`${inputCls} w-full mt-1`}
        />
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
        {openInits.map((i) => {
          const r = rollups[i.id];
          const pctTasks = r && r.tasksTotal > 0 ? Math.round((r.tasksDone / r.tasksTotal) * 100) : null;
          const leaving = isLeaving(i.id);
          return (
            <li key={i.id} className={`text-sm ${leaving ? "task-leaving" : ""}`}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleInitiative(i)}
                  disabled={busy || leaving}
                  className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${
                    leaving ? "bg-orange border-orange text-white" : "border-outline text-transparent hover:border-orange/60"
                  }`}
                  aria-label="Mark done"
                >✓</button>
                <EditableText
                  value={i.title}
                  onSave={(v) => { if (v) void patchInit(i, { title: v }); }}
                  ariaLabel="Initiative title"
                  className={`flex-1 min-w-0 ${leaving ? "text-ink-2 line-through" : "text-ink-1"}`}
                />
                <EditableText
                  value={i.owner}
                  onSave={(v) => patchInit(i, { owner: v })}
                  placeholder="+ owner"
                  ariaLabel="Initiative owner"
                  className="text-[10px] text-ink-2 shrink-0"
                />
                <button
                  onClick={() => void removeInit(i)}
                  disabled={busy}
                  className="text-ink-3 hover:text-expense text-sm px-1 shrink-0"
                  aria-label="Delete initiative"
                >×</button>
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

      {doneInits.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowDoneInits((v) => !v)}
            className="text-[11px] font-semibold text-ink-3 hover:text-ink-1"
          >
            {showDoneInits ? "Hide" : "Show"} {doneInits.length} done
          </button>
          {showDoneInits && (
            <ul className="mt-1.5 space-y-1.5">
              {doneInits.map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => toggleInitiative(i)}
                    disabled={busy}
                    className="w-4 h-4 rounded-full border border-orange bg-orange text-white flex items-center justify-center text-[10px]"
                    aria-label="Mark not done"
                  >✓</button>
                  <span className="text-ink-2 line-through">{i.title}</span>
                  {i.owner && <span className="text-[10px] text-ink-2">· {i.owner}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
  // The target is a human-set goal, so it's editable on every KPI — including
  // auto ones (the system computes the actual, not the target you're aiming at).
  const [editingTarget, setEditingTarget] = useState(false);
  const [tval, setTval] = useState(kpi.target?.toString() ?? "");
  // The baseline (where the measure started) — editable on every KPI so the
  // surface can show start → now → target instead of a bare number (B2-2).
  const [editingBaseline, setEditingBaseline] = useState(false);
  const [bval, setBval] = useState(kpi.baseline?.toString() ?? "");
  // The descriptive fields (unit / owner / cadence) live behind a details
  // toggle so the value-dense row stays readable.
  const [showDetails, setShowDetails] = useState(false);

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
  const saveTarget = async () => {
    const n = tval.trim() === "" ? null : Number(tval);
    if (n !== null && !Number.isFinite(n)) { alert("Enter a number"); return; }
    setEditingTarget(false);
    await patch({ target: n });
  };
  const saveBaseline = async () => {
    const n = bval.trim() === "" ? null : Number(bval);
    if (n !== null && !Number.isFinite(n)) { alert("Enter a number"); return; }
    setEditingBaseline(false);
    await patch({ baseline: n });
  };
  const remove = async () => {
    if (!confirm(`Delete KPI “${kpi.title}”?`)) return;
    setBusy(true);
    try { await api(`/api/admin/plan/kpis/${kpi.id}`, "DELETE"); router.refresh(); }
    finally { setBusy(false); }
  };

  // Trust cue: a measure you can't date is one you don't trust. Auto measures
  // refresh from the spine; manual ones go stale-styled past their cadence.
  const fresh = measureFreshness(kpi.last_updated_at, kpi.cadence);

  return (
    <div className={`bg-tile/60 rounded-lg ${busy ? "opacity-60" : ""}`}>
    <div className="flex items-center gap-2 text-xs px-3 py-1.5">
      <EditableText
        value={kpi.title}
        onSave={(v) => { if (v) void patch({ title: v }); }}
        ariaLabel="Measure title"
        className="text-ink-1 flex-1 min-w-0 truncate"
      />
      <span
        className={`hidden sm:inline text-[9px] tabular-nums ${fresh.stale ? "text-status-watch-text font-semibold" : "text-ink-3"}`}
        title={kpi.source === "auto" ? "Refreshed from the spine" : "Last manual update"}
      >
        {fresh.text}
      </span>
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
        <span className="tabular-nums flex items-center">
          {editingBaseline ? (
            <span className="flex items-center gap-1 mr-1">
              <input
                autoFocus
                className={`${inputCls} !py-0.5 !px-1.5 !text-xs w-16`}
                value={bval}
                placeholder="start"
                onChange={(e) => setBval(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void saveBaseline(); if (e.key === "Escape") setEditingBaseline(false); }}
              />
              <button onClick={() => void saveBaseline()} className="text-revenue">✓</button>
              <span className="text-ink-3">→</span>
            </span>
          ) : (
            <button
              onClick={() => setEditingBaseline(true)}
              className="text-ink-3 hover:text-orange mr-1"
              title="Click to set the baseline (where this measure started)"
            >
              {kpi.baseline !== null ? `${fmtVal(kpi.baseline, kpi.unit)} →` : "+start"}
            </button>
          )}
          <button
            onClick={() => kpi.source === "manual" && setEditing(true)}
            className={kpi.source === "manual" ? "text-ink-1 hover:text-orange" : "text-ink-2 cursor-default"}
            title={kpi.source === "manual" ? "Click to update the value" : "Value computed automatically"}
          >
            {fmtVal(kpi.current, kpi.unit)}
          </button>
          {editingTarget ? (
            <span className="flex items-center gap-1 ml-1">
              <span className="text-ink-3">/</span>
              <input
                autoFocus
                className={`${inputCls} !py-0.5 !px-1.5 !text-xs w-20`}
                value={tval}
                placeholder="target"
                onChange={(e) => setTval(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void saveTarget(); if (e.key === "Escape") setEditingTarget(false); }}
              />
              <button onClick={() => void saveTarget()} className="text-revenue">✓</button>
            </span>
          ) : (
            <button
              onClick={() => setEditingTarget(true)}
              className="text-ink-3 hover:text-orange ml-1"
              title="Click to set the target"
            >
              / {kpi.target !== null ? fmtVal(kpi.target, kpi.unit) : "—"}
            </button>
          )}
        </span>
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
      <button
        onClick={() => setShowDetails((v) => !v)}
        className={`text-sm leading-none ${showDetails ? "text-orange" : "text-ink-3 hover:text-orange"}`}
        aria-label="Edit unit, owner, cadence, note"
        aria-expanded={showDetails}
        title="Unit · owner · cadence · note"
      >⋯</button>
      <button onClick={() => void remove()} className="text-ink-3 hover:text-expense">×</button>
    </div>
    {showDetails && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-2 pt-1.5 text-[11px] text-ink-3 border-t border-hairline">
        <span className="flex items-center gap-1">Unit
          <EditableText
            value={kpi.unit}
            onSave={(v) => patch({ unit: v })}
            placeholder="—"
            ariaLabel="Measure unit"
            className="text-ink-1"
            inputClassName={`${inputCls} !py-0.5 !px-1.5 !text-xs w-16`}
          />
        </span>
        <span className="flex items-center gap-1">Owner
          <EditableText
            value={kpi.owner}
            onSave={(v) => patch({ owner: v })}
            placeholder="+ owner"
            ariaLabel="Measure owner"
            className="text-ink-1"
            inputClassName={`${inputCls} !py-0.5 !px-1.5 !text-xs w-28`}
          />
        </span>
        <span className="flex items-center gap-1">Cadence
          <EditableText
            value={kpi.cadence}
            onSave={(v) => patch({ cadence: v })}
            placeholder="e.g. monthly"
            ariaLabel="Measure cadence"
            className="text-ink-1"
            inputClassName={`${inputCls} !py-0.5 !px-1.5 !text-xs w-24`}
          />
        </span>
        <span className="flex items-start gap-1 w-full">Note
          <EditableText
            value={kpi.notes}
            onSave={(v) => patch({ notes: v })}
            placeholder="+ what's behind this number?"
            multiline
            ariaLabel="Measure note"
            className="text-ink-1 flex-1 min-w-0 whitespace-pre-wrap"
            inputClassName={`${inputCls} w-full !py-1 !px-1.5 !text-xs`}
          />
        </span>
      </div>
    )}
    </div>
  );
}

// ── New KPI (attached to a goal) ───────────────────────────────────────────
// Two modes: a manual measure (typed value, updated at the review) or an
// automatic one bound to a registry metric (source='auto'), which then refreshes
// from the spine. Only metrics the registry can actually compute are offered, so
// "auto" never lands on a value nothing updates.
function NewKpiForm({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState("");
  const [baseline, setBaseline] = useState("");
  const [metricKey, setMetricKey] = useState("");
  const [metrics, setMetrics] = useState<MetricOption[] | null>(null);

  // Load the bindable metrics once, when the form first opens.
  useEffect(() => {
    if (!open || metrics) return;
    void fetch("/api/admin/plan/kpis/metrics")
      .then((r) => (r.ok ? r.json() : { metrics: [] }))
      .then((j) => setMetrics(j.metrics ?? []))
      .catch(() => setMetrics([]));
  }, [open, metrics]);

  const chosen = metrics?.find((m) => m.key === metricKey) ?? null;

  const reset = () => {
    setTitle(""); setUnit(""); setTarget(""); setBaseline(""); setMetricKey(""); setMode("manual"); setOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body =
        mode === "auto" && chosen
          ? {
              goal_id: goalId,
              title: title.trim() || chosen.label,
              unit: chosen.unit || undefined,
              target: target.trim() === "" ? undefined : Number(target),
              source: "auto",
              metric_key: chosen.key,
              current: chosen.value ?? undefined,
            }
          : {
              goal_id: goalId,
              title,
              unit: unit || undefined,
              target: target.trim() === "" ? undefined : Number(target),
              baseline: baseline.trim() === "" ? undefined : Number(baseline),
            };
      const ok = await api("/api/admin/plan/kpis", "POST", body);
      if (ok) { reset(); router.refresh(); }
    } finally { setBusy(false); }
  };

  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-[11px] text-ink-2 hover:text-orange mt-2">+ Add measure</button>;
  }
  return (
    <form onSubmit={submit} className="mt-2 bg-tile/40 rounded-lg p-2 space-y-2">
      <div className="inline-flex p-0.5 bg-tile border border-outline rounded-full text-[10px] font-semibold">
        {(["manual", "auto"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-2.5 py-0.5 rounded-full transition-colors ${mode === m ? "bg-orange text-white" : "text-ink-2 hover:text-ink-1"}`}
          >
            {m === "manual" ? "Manual" : "Track automatically"}
          </button>
        ))}
      </div>

      {mode === "auto" ? (
        <div className="flex flex-wrap items-end gap-2">
          <select
            className={`${inputCls} flex-1 min-w-[200px] !py-1 !text-xs`}
            value={metricKey}
            required
            onChange={(e) => {
              const m = metrics?.find((x) => x.key === e.target.value);
              setMetricKey(e.target.value);
              if (m && !title) setTitle(m.label);
            }}
          >
            <option value="" disabled>{metrics ? "Choose a live metric…" : "Loading metrics…"}</option>
            {(metrics ?? []).map((m) => (
              <option key={m.key} value={m.key} disabled={m.bound}>
                {m.label}
                {m.value != null ? ` — ${fmtVal(m.value, m.unit)}` : ""}
                {m.bound ? " · in use" : ""}
              </option>
            ))}
          </select>
          <input className={`${inputCls} w-24 !py-1 !text-xs`} placeholder="target" value={target} onChange={(e) => setTarget(e.target.value)} />
          <button type="submit" disabled={busy || !chosen} className="text-[11px] bg-orange hover:bg-orange-dark text-white px-3 py-1 rounded-lg disabled:opacity-50">Add</button>
          <button type="button" onClick={reset} className="text-[11px] text-ink-2 px-1">Cancel</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <input className={`${inputCls} flex-1 min-w-[180px] !py-1 !text-xs`} placeholder="Measure (e.g. Processes documented)" value={title} required autoFocus onChange={(e) => setTitle(e.target.value)} />
          <input className={`${inputCls} w-16 !py-1 !text-xs`} placeholder="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <input className={`${inputCls} w-20 !py-1 !text-xs`} placeholder="start" value={baseline} onChange={(e) => setBaseline(e.target.value)} />
          <input className={`${inputCls} w-20 !py-1 !text-xs`} placeholder="target" value={target} onChange={(e) => setTarget(e.target.value)} />
          <button type="submit" disabled={busy} className="text-[11px] bg-orange hover:bg-orange-dark text-white px-3 py-1 rounded-lg disabled:opacity-50">Add</button>
          <button type="button" onClick={reset} className="text-[11px] text-ink-2 px-1">Cancel</button>
        </div>
      )}
    </form>
  );
}
