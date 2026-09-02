"use client";

// Client controls for the Fundraising Plan: strategy create/edit/delete, the
// gift-table editor with its pyramid generator, and the link/unlink controls
// that file spine objects under a strategy. All call the plan APIs then
// router.refresh() so the server pages re-render with fresh rollups — the
// controls never compute a number themselves.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateGiftLevels, type GiftLevel } from "@/lib/fundraising/plan";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
const btnCls =
  "text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors disabled:opacity-50";
const primaryBtnCls =
  "text-xs font-semibold text-white bg-orange hover:bg-orange/90 px-4 py-2 rounded-full transition-colors disabled:opacity-50";

async function call(path: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return j.error ?? `HTTP ${res.status}`;
    }
    return null;
  } catch {
    return "Network error — try again";
  }
}

// ── Strategy create / edit ──────────────────────────────────────────────────

export function StrategyForm({
  planYear,
  strategy,
  onDone,
}: {
  planYear: number;
  /** Present when editing; absent when creating. */
  strategy?: { id: string; name: string; goal: number; owner: string | null; notes: string | null };
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(strategy?.name ?? "");
  const [goal, setGoal] = useState(strategy ? String(strategy.goal) : "");
  const [owner, setOwner] = useState(strategy?.owner ?? "");
  const [notes, setNotes] = useState(strategy?.notes ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      name,
      goal: goal ? Number(goal) : 0,
      owner,
      notes,
      ...(strategy ? { id: strategy.id } : { plan_year: planYear }),
    };
    const err = await call("/api/admin/fundraising/plan", strategy ? "PATCH" : "POST", payload);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (!strategy) {
      setName("");
      setGoal("");
      setOwner("");
      setNotes("");
    }
    onDone?.();
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2">
      <input
        className={inputCls}
        placeholder="Strategy name (e.g. Major gifts)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className={inputCls}
        placeholder="Goal for the year ($)"
        type="number"
        min="0"
        step="0.01"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />
      <input
        className={inputCls}
        placeholder="Owner"
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
      />
      <textarea
        className={`${inputCls} sm:col-span-2`}
        placeholder="Notes — the playbook, preconditions, risks"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className={primaryBtnCls} disabled={busy}>
          {strategy ? "Save strategy" : "Add strategy"}
        </button>
        {error && <span className="text-xs text-expense">{error}</span>}
      </div>
    </form>
  );
}

export function NewStrategyButton({ planYear }: { planYear: number }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className={btnCls} onClick={() => setOpen(true)}>
        + New strategy
      </button>
    );
  }
  return (
    <div className="w-full bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-ink-1">New strategy · {planYear}</span>
        <button className="text-xs text-ink-3 hover:text-ink-1" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <StrategyForm planYear={planYear} onDone={() => setOpen(false)} />
    </div>
  );
}

export function EditStrategyPanel({
  planYear,
  strategy,
}: {
  planYear: number;
  strategy: { id: string; name: string; goal: number; owner: string | null; notes: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!confirm(`Delete the "${strategy.name}" strategy? Linked asks, grants, and campaigns are released, never deleted.`)) return;
    setBusy(true);
    const err = await call(`/api/admin/fundraising/plan?id=${strategy.id}`, "DELETE");
    setBusy(false);
    if (err) {
      alert(err);
      return;
    }
    router.push("/admin/fundraising/plan");
    router.refresh();
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <button className={btnCls} onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Edit"}
        </button>
        <button className={btnCls} onClick={remove} disabled={busy}>
          Delete
        </button>
      </div>
      {open && (
        <div className="mt-3 bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg p-4">
          <StrategyForm planYear={planYear} strategy={strategy} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

// ── Gift-table editor ───────────────────────────────────────────────────────

export function GiftTableEditor({
  strategyId,
  goal,
  initial,
}: {
  strategyId: string;
  goal: number;
  initial: GiftLevel[];
}) {
  const router = useRouter();
  const [levels, setLevels] = useState<GiftLevel[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (i: number, field: keyof GiftLevel, value: number) => {
    setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, [field]: value } : l)));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    setError("");
    const err = await call("/api/admin/fundraising/plan/levels", "PUT", {
      strategy_id: strategyId,
      levels,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDirty(false);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      {levels.length > 0 && (
        <div className="space-y-1.5">
          {levels.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={`${inputCls} w-36`}
                type="number"
                min="1"
                step="0.01"
                value={l.amount}
                onChange={(e) => set(i, "amount", Number(e.target.value))}
                aria-label={`Level ${i + 1} amount`}
              />
              <span className="text-xs text-ink-3">×</span>
              <input
                className={`${inputCls} w-20`}
                type="number"
                min="1"
                step="1"
                value={l.count_needed}
                onChange={(e) => set(i, "count_needed", Number(e.target.value))}
                aria-label={`Level ${i + 1} count`}
              />
              <button
                className="text-xs text-ink-3 hover:text-expense"
                onClick={() => {
                  setLevels((ls) => ls.filter((_, j) => j !== i));
                  setDirty(true);
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          className={btnCls}
          onClick={() => {
            setLevels(generateGiftLevels(goal));
            setDirty(true);
          }}
          disabled={goal <= 0}
          title={goal <= 0 ? "Set a goal on the strategy first" : undefined}
        >
          {levels.length > 0 ? "Regenerate from goal" : "Generate gift table"}
        </button>
        <button
          className={btnCls}
          onClick={() => {
            setLevels((ls) => [...ls, { amount: 1000, count_needed: 1 }]);
            setDirty(true);
          }}
        >
          + Level
        </button>
        {dirty && (
          <button className={primaryBtnCls} onClick={save} disabled={busy}>
            Save table
          </button>
        )}
        {error && <span className="text-xs text-expense">{error}</span>}
      </div>
    </div>
  );
}

// ── Link / unlink spine objects ─────────────────────────────────────────────

export type AssignType = "opportunity" | "grant" | "campaign";

export function AssignButton({
  type,
  id,
  strategyId,
  label,
}: {
  type: AssignType;
  id: string;
  /** null unlinks. */
  strategyId: string | null;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="text-[11px] font-semibold text-ink-2 hover:text-orange transition-colors whitespace-nowrap disabled:opacity-50"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const err = await call("/api/admin/fundraising/plan/assign", "PATCH", {
          type,
          id,
          strategy_id: strategyId,
        });
        setBusy(false);
        if (err) alert(err);
        else router.refresh();
      }}
    >
      {label}
    </button>
  );
}
