"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AUTO_METRIC_CATALOG } from "@/lib/admin/plan/metricCatalog";

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

export default function SetupWizard({
  foundationSet,
  objectives,
  goals,
  kpis,
  initiatives,
  nextReviewAt,
}: {
  foundationSet: boolean;
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
        {!foundationSet && (
          <Link href="/admin/strategic-plan" className="text-xs font-semibold text-orange hover:underline">Edit foundation on the plan →</Link>
        )}
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
          <QuickAdd placeholder="New objective (e.g. Execute an effective fundraising strategy)" onAdd={async (title) => { if (await api("/api/admin/plan/objectives", { title })) refresh(); }} />
        ) : objectivesNoGoals.length > 0 ? (
          <div className="space-y-3">
            {objectivesNoGoals.map((o) => (
              <div key={o.id}>
                <div className="text-xs text-ink-1 mb-1">{o.title}</div>
                <QuickAdd placeholder="Add a SMART goal for this objective" onAdd={async (title) => { if (await api("/api/admin/plan/goals", { title, objective_id: o.id })) refresh(); }} />
              </div>
            ))}
          </div>
        ) : null}
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
