"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PlanGoal = {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: string;
};

export type PlanInitiative = {
  id: string;
  goal_id: string;
  title: string;
  owner: string | null;
  status: string;
};

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

const STATUS_STYLES: Record<string, string> = {
  on_track: "bg-revenue-bg text-revenue",
  at_risk: "bg-[#F4E8D0] text-[#A56A1B]",
  behind: "bg-expense-bg text-expense",
  done: "bg-tile text-ink-2",
};
const STATUS_LABELS: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  behind: "Behind",
  done: "Done",
};

export function NewGoalForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/plan/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, target_date: targetDate || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      setTitle(""); setTargetDate("");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors">
        + New goal
      </button>
    );
  }
  return (
    <form onSubmit={submit}
      className="w-full bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-4 flex flex-wrap items-end gap-3">
      <label className="flex-1 min-w-[240px] text-xs text-ink-2">
        Goal
        <input className={`${inputCls} w-full mt-1`} value={title} required autoFocus
          placeholder="Serve 2,500 students across 35 school partners"
          onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="text-xs text-ink-2">
        Target date
        <input className={`${inputCls} block mt-1`} type="date" value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)} />
      </label>
      <button type="submit" disabled={busy}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50">
        {busy ? "Saving…" : "Create"}
      </button>
      <button type="button" onClick={() => setOpen(false)}
        className="text-xs text-ink-2 hover:text-ink-1 px-2">
        Cancel
      </button>
    </form>
  );
}

export function GoalCard({
  goal,
  initiatives,
}: {
  goal: PlanGoal;
  initiatives: PlanInitiative[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newInit, setNewInit] = useState("");

  const done = initiatives.filter((i) => i.status === "done").length;
  const pct = initiatives.length > 0 ? Math.round((done / initiatives.length) * 100) : 0;

  const patchGoal = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/plan/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const addInitiative = async () => {
    if (!newInit.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/admin/plan/initiatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newInit.trim(), goal_id: goal.id }),
      });
      setNewInit("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleInitiative = async (init: PlanInitiative) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/plan/initiatives/${init.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: init.status === "done" ? "todo" : "done" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const removeGoal = async () => {
    if (!confirm(`Delete goal “${goal.title}” and its initiatives?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/plan/goals/${goal.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`bg-surface border-[1.5px] border-outline rounded-card p-5 ${busy ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading font-semibold text-ink-1 flex-1 min-w-0">{goal.title}</h2>
        <select
          value={goal.status}
          onChange={(e) => void patchGoal({ status: e.target.value })}
          className={`text-[11px] font-semibold rounded-full px-2 py-1 border-0 cursor-pointer ${STATUS_STYLES[goal.status]}`}
        >
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k} className="bg-surface text-ink-1">{v}</option>
          ))}
        </select>
        {goal.target_date && (
          <span className="text-[11px] text-ink-2 tabular-nums">by {goal.target_date}</span>
        )}
        <button onClick={() => void removeGoal()}
          className="text-[11px] text-ink-2 hover:text-expense px-1">
          Delete
        </button>
      </div>

      {initiatives.length > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-tile overflow-hidden">
            <div className="h-full bg-orange transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-ink-2 tabular-nums">
            {done}/{initiatives.length}
          </span>
        </div>
      )}

      <ul className="mt-3 space-y-1.5">
        {initiatives.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <button
              onClick={() => void toggleInitiative(i)}
              className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                i.status === "done"
                  ? "bg-orange border-orange text-white"
                  : "border-outline text-transparent hover:border-orange/60"
              }`}
              aria-label={i.status === "done" ? "Mark not done" : "Mark done"}
            >
              ✓
            </button>
            <span className={i.status === "done" ? "text-ink-2 line-through" : "text-ink-1"}>
              {i.title}
            </span>
            {i.owner && <span className="text-[10px] text-ink-2">· {i.owner}</span>}
          </li>
        ))}
      </ul>

      <div className="flex gap-2 mt-3">
        <input
          className={`${inputCls} flex-1 !py-1.5 !text-xs`}
          placeholder="Add initiative…"
          value={newInit}
          onChange={(e) => setNewInit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void addInitiative(); }
          }}
        />
        <button onClick={() => void addInitiative()} disabled={busy}
          className="text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2 px-3 rounded-lg">
          Add
        </button>
      </div>
    </section>
  );
}
