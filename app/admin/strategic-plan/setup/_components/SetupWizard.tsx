"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AUTO_METRIC_CATALOG } from "@/lib/admin/plan/metricCatalog";
import { STARTER_OBJECTIVES } from "@/lib/admin/plan/template";

export type WizObjective = { id: string; title: string };
export type WizGoal = { id: string; title: string; objective_id: string | null };
export type WizKpi = { id: string; goal_id: string | null; objective_id: string | null; source: string; metric_key: string | null };
export type WizInitiative = { id: string; goal_id: string };

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

async function api(url: string, body: unknown): Promise<boolean> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    alert(j.error ?? `HTTP ${res.status}`);
    return false;
  }
  return true;
}

function StepCard({
  n,
  title,
  done,
  hint,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="bg-surface border-[1.5px] border-outline rounded-card-lg p-5">
      <div className="flex items-center gap-3">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
            done ? "bg-revenue text-white" : "bg-tile text-ink-2 border border-outline"
          }`}
        >
          {done ? "✓" : n}
        </span>
        <h2 className="font-heading font-semibold text-ink-1 flex-1">{title}</h2>
        <span className={`text-[11px] font-semibold ${done ? "text-revenue" : "text-[#A56A1B]"}`}>
          {done ? "Done" : "Needs attention"}
        </span>
      </div>
      {hint && <p className="text-xs text-ink-2 mt-2 ml-9">{hint}</p>}
      {children && <div className="mt-3 ml-9">{children}</div>}
    </section>
  );
}

// One-field inline add (goal / initiative / objective).
function QuickAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => Promise<void> }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!val.trim()) return;
    setBusy(true);
    try {
      await onAdd(val.trim());
      setVal("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex gap-2">
      <input
        className={`${inputCls} flex-1 !py-1.5 !text-xs`}
        placeholder={placeholder}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void submit(); }
        }}
      />
      <button onClick={() => void submit()} disabled={busy} className="text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2 px-3 rounded-lg">
        Add
      </button>
    </div>
  );
}

// The measure picker — wire to live data (auto) in one click, or a manual measure.
function AddMeasure({ goalId, onDone }: { goalId: string; onDone: () => void }) {
  const [manual, setManual] = useState(false);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  const addAuto = async (key: string, label: string, unit: string) => {
    setBusy(true);
    try {
      if (await api("/api/admin/plan/kpis", { goal_id: goalId, title: label, unit, source: "auto", metric_key: key })) onDone();
    } finally {
      setBusy(false);
    }
  };
  const addManual = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const ok = await api("/api/admin/plan/kpis", {
        goal_id: goalId,
        title: title.trim(),
        unit: unit || undefined,
        target: target.trim() === "" ? undefined : Number(target),
        source: "manual",
      });
      if (ok) onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`space-y-2 ${busy ? "opacity-60" : ""}`}>
      <div className="text-[11px] text-ink-2">Wire to live data (computes itself):</div>
      <div className="flex flex-wrap gap-1.5">
        {AUTO_METRIC_CATALOG.map((m) => (
          <button
            key={m.key}
            onClick={() => void addAuto(m.key, m.label, m.unit)}
            disabled={busy}
            title={m.description}
            className="text-[11px] bg-revenue-bg text-revenue rounded-full px-2.5 py-1 hover:opacity-80"
          >
            + {m.label}
          </button>
        ))}
      </div>
      {manual ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input className={`${inputCls} flex-1 min-w-[160px] !py-1 !text-xs`} placeholder="Manual measure (e.g. Processes documented)" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
          <input className={`${inputCls} w-14 !py-1 !text-xs`} placeholder="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <input className={`${inputCls} w-16 !py-1 !text-xs`} placeholder="target" value={target} onChange={(e) => setTarget(e.target.value)} />
          <button onClick={() => void addManual()} disabled={busy} className="text-[11px] bg-orange hover:bg-orange-dark text-white px-3 py-1 rounded-lg">Add</button>
        </div>
      ) : (
        <button onClick={() => setManual(true)} className="text-[11px] text-ink-2 hover:text-orange">or add a manual measure →</button>
      )}
    </div>
  );
}

export type WizFoundation = { mission: string; vision: string; values: string; behaviors: string };

// Inline foundation editor (spec #6 F1): a brand-new org must not be sent away
// at step 1 — mission/vision/values save right here via the existing PUT route.
function FoundationForm({ initial, onSaved }: { initial: WizFoundation; onSaved: () => void }) {
  const [mission, setMission] = useState(initial.mission);
  const [vision, setVision] = useState(initial.vision);
  const [values, setValues] = useState(initial.values);
  const [behaviors, setBehaviors] = useState(initial.behaviors);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/plan/foundation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mission: mission.trim() || null,
          vision: vision.trim() || null,
          values,
          behaviors,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-[11px] text-ink-2">
        Mission — why you exist, one sentence
        <textarea className={`${inputCls} block w-full mt-1 !text-xs`} rows={2} value={mission}
          placeholder="e.g. To empower young people with the skills and support to thrive."
          onChange={(e) => setMission(e.target.value)} />
      </label>
      <label className="block text-[11px] text-ink-2">
        Vision — the world if you succeed
        <textarea className={`${inputCls} block w-full mt-1 !text-xs`} rows={2} value={vision}
          onChange={(e) => setVision(e.target.value)} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block text-[11px] text-ink-2">
          Values (comma-separated)
          <input className={`${inputCls} block w-full mt-1 !text-xs`} value={values}
            placeholder="Integrity, Learning, …" onChange={(e) => setValues(e.target.value)} />
        </label>
        <label className="block text-[11px] text-ink-2">
          Behaviors (comma-separated)
          <input className={`${inputCls} block w-full mt-1 !text-xs`} value={behaviors}
            onChange={(e) => setBehaviors(e.target.value)} />
        </label>
      </div>
      <button onClick={() => void save()} disabled={busy || !mission.trim()}
        className="text-[11px] font-semibold bg-orange hover:bg-orange-dark text-white px-4 py-1.5 rounded-full disabled:opacity-50">
        {busy ? "Saving…" : "Save foundation"}
      </button>
    </div>
  );
}

// Fuller objective authoring (spec #6 F2): title + optional 3-year statement,
// available whether the org has zero objectives or is adding its fifth.
function AddObjective({ onDone, autoOpen = false }: { onDone: () => void; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] font-semibold text-orange hover:text-orange-dark">
        + Add an objective
      </button>
    );
  }
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const ok = await api("/api/admin/plan/objectives", {
        title: title.trim(),
        three_year_statement: statement.trim() || undefined,
      });
      if (ok) { setTitle(""); setStatement(""); onDone(); }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`space-y-2 ${busy ? "opacity-60" : ""}`}>
      <input
        className={`${inputCls} w-full !py-1.5 !text-xs`}
        placeholder="Objective — a standing pillar (e.g. Execute an effective fundraising strategy)"
        value={title} autoFocus onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className={`${inputCls} w-full !text-xs`} rows={2}
        placeholder="3-year statement (optional) — what does success look like for this pillar?"
        value={statement} onChange={(e) => setStatement(e.target.value)}
      />
      <div className="flex gap-2">
        <button onClick={() => void submit()} disabled={busy || !title.trim()}
          className="text-[11px] font-semibold bg-orange hover:bg-orange-dark text-white px-4 py-1.5 rounded-full disabled:opacity-50">
          Add objective
        </button>
        {!autoOpen && (
          <button onClick={() => setOpen(false)} className="text-[11px] text-ink-2 hover:text-ink-1 px-2">Cancel</button>
        )}
      </div>
    </div>
  );
}

// Starter-shape loader (spec #6 F3): four tenant-neutral pillars with
// bracketed statement prompts, created through the same objectives route.
function LoadTemplateButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      for (let i = 0; i < STARTER_OBJECTIVES.length; i++) {
        const o = STARTER_OBJECTIVES[i];
        const ok = await api("/api/admin/plan/objectives", {
          title: o.title,
          three_year_statement: o.statement,
          sort_order: i,
        });
        if (!ok) return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={() => void load()} disabled={busy}
      className="text-[11px] font-semibold text-ink-2 bg-tile hover:bg-[#EFE6D4] border border-outline px-3 py-1.5 rounded-full disabled:opacity-50">
      {busy ? "Loading…" : "Load the starter shape (4 generic pillars you'll rename)"}
    </button>
  );
}

export default function SetupWizard({
  foundationSet,
  foundation,
  objectives,
  goals,
  kpis,
  initiatives,
  nextReviewAt,
}: {
  foundationSet: boolean;
  foundation: WizFoundation;
  objectives: WizObjective[];
  goals: WizGoal[];
  kpis: WizKpi[];
  initiatives: WizInitiative[];
  nextReviewAt: string | null;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [reviewDate, setReviewDate] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  const goalHasKpi = new Set(kpis.filter((k) => k.goal_id).map((k) => k.goal_id as string));
  const goalHasInit = new Set(initiatives.map((i) => i.goal_id));
  const objectiveHasGoal = new Set(goals.filter((g) => g.objective_id).map((g) => g.objective_id as string));

  const objectivesNoGoals = objectives.filter((o) => !objectiveHasGoal.has(o.id));
  const goalsNoMeasure = goals.filter((g) => !goalHasKpi.has(g.id));
  const goalsNoInitiative = goals.filter((g) => !goalHasInit.has(g.id));
  const today = new Date().toISOString().slice(0, 10);
  const reviewSet = !!(nextReviewAt && nextReviewAt >= today);

  const autoCount = kpis.filter((k) => k.source === "auto").length;
  const allMeasured = goals.length > 0 && goalsNoMeasure.length === 0;
  const complete =
    foundationSet && objectives.length > 0 && objectivesNoGoals.length === 0 && allMeasured && goalsNoInitiative.length === 0 && reviewSet;

  const setReview = async () => {
    if (!reviewDate) return;
    setReviewBusy(true);
    try {
      if (await api("/api/admin/plan/reviews", { notes: "Plan setup — first review scheduled.", next_review_at: reviewDate })) refresh();
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {complete && (
        <div className="bg-revenue-bg border-[1.5px] border-revenue/30 rounded-card-lg p-5">
          <p className="text-sm text-ink-1 font-semibold">Your plan is measurable. ✓</p>
          <p className="text-xs text-ink-2 mt-1">
            {objectives.length} objectives · {goals.length} goals · {kpis.length} measures ({autoCount} wired to live data) ·{" "}
            {initiatives.length} initiatives. Run it from the{" "}
            <Link href="/admin/strategic-plan" className="text-orange hover:underline">plan</Link> and review monthly.
          </p>
        </div>
      )}

      <StepCard n={1} title="Foundation" done={foundationSet}
        hint={foundationSet ? "Mission, vision, values, and behaviors are set." : "Add your mission, vision, values, and behaviors — the culture home."}>
        {!foundationSet && <FoundationForm initial={foundation} onSaved={refresh} />}
      </StepCard>

      <StepCard n={2} title="Objectives have goals" done={objectives.length > 0 && objectivesNoGoals.length === 0}
        hint={
          objectives.length === 0
            ? "No objectives yet — add the standing departments you run against (you author these; the wizard never invents strategy)."
            : objectivesNoGoals.length === 0
            ? "Every objective has at least one goal."
            : `${objectivesNoGoals.length} objective${objectivesNoGoals.length === 1 ? "" : "s"} need a goal.`
        }>
        {objectives.length === 0 ? (
          <div className="space-y-3">
            <AddObjective onDone={refresh} autoOpen />
            <div className="flex items-center gap-2 text-[11px] text-ink-3">
              <span>or</span>
              <LoadTemplateButton onDone={refresh} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {objectivesNoGoals.map((o) => (
              <div key={o.id}>
                <div className="text-xs text-ink-1 mb-1">{o.title}</div>
                <QuickAdd placeholder="Add a SMART goal for this objective" onAdd={async (title) => { if (await api("/api/admin/plan/goals", { title, objective_id: o.id })) refresh(); }} />
              </div>
            ))}
            <AddObjective onDone={refresh} />
          </div>
        )}
      </StepCard>

      <StepCard n={3} title="Every goal has a measure" done={allMeasured}
        hint={
          goals.length === 0
            ? "Add goals first, then give each one a measure."
            : goalsNoMeasure.length === 0
            ? `All ${goals.length} goals are measured (${autoCount} wired to live data).`
            : `${goalsNoMeasure.length} goal${goalsNoMeasure.length === 1 ? "" : "s"} have no measure. Wire one to live data, or add a manual one.`
        }>
        {goalsNoMeasure.length > 0 && (
          <div className="space-y-4">
            {goalsNoMeasure.map((g) => (
              <div key={g.id} className="border-t border-outline pt-3 first:border-0 first:pt-0">
                <div className="text-xs text-ink-1 mb-1.5">{g.title}</div>
                <AddMeasure goalId={g.id} onDone={refresh} />
              </div>
            ))}
          </div>
        )}
      </StepCard>

      <StepCard n={4} title="Every goal has an initiative" done={goals.length > 0 && goalsNoInitiative.length === 0}
        hint={
          goals.length === 0
            ? "Add goals first."
            : goalsNoInitiative.length === 0
            ? "Every goal has at least one initiative (the 'how')."
            : `${goalsNoInitiative.length} goal${goalsNoInitiative.length === 1 ? "" : "s"} have no initiative.`
        }>
        {goalsNoInitiative.length > 0 && (
          <div className="space-y-3">
            {goalsNoInitiative.map((g) => (
              <div key={g.id}>
                <div className="text-xs text-ink-1 mb-1">{g.title}</div>
                <QuickAdd placeholder="Add an initiative (an action that moves this goal)" onAdd={async (title) => { if (await api("/api/admin/plan/initiatives", { title, goal_id: g.id })) refresh(); }} />
              </div>
            ))}
          </div>
        )}
      </StepCard>

      <StepCard n={5} title="Review cadence" done={reviewSet}
        hint={reviewSet ? `Next review set for ${nextReviewAt}.` : "Set the date of your first monthly OGSM review so the cockpit can nudge you."}>
        {!reviewSet && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className={`${inputCls} !py-1.5 !text-xs`} value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
            <button onClick={() => void setReview()} disabled={reviewBusy || !reviewDate} className="text-[11px] font-semibold bg-orange hover:bg-orange-dark text-white px-4 py-1.5 rounded-full disabled:opacity-50">
              {reviewBusy ? "Saving…" : "Set review date"}
            </button>
          </div>
        )}
      </StepCard>
    </div>
  );
}
