"use client";

// Client controls for the Fundraising Plan: strategy create/edit/delete, the
// gift-table editor with its pyramid generator, and the link/unlink controls
// that file spine objects under a strategy. All call the plan APIs then
// router.refresh() so the server pages re-render with fresh rollups — the
// controls never compute a number themselves.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";

const inputCls =
  "bg-tile border-hairline rounded-control px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";
const btnCls =
  "text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-tile border-hairline px-4 py-2 rounded-full transition-colors disabled:opacity-50";
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
      return userMessage(res, j);
    }
    return null;
  } catch {
    return networkMessage();
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
        placeholder="Notes: the playbook, preconditions, risks"
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
    <div className="w-full bg-tile border-hairline rounded-panel-lg p-4 mt-2">
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
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    const ok = await confirm({
      title: `Delete the "${strategy.name}" strategy?`,
      body: "Linked asks, grants, and campaigns are released, never deleted.",
      confirmLabel: "Delete strategy",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const err = await call(`/api/admin/fundraising/plan?id=${strategy.id}`, "DELETE");
    setBusy(false);
    if (err) {
      toast.error(err);
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
        <div className="mt-3 bg-tile border-hairline rounded-panel-lg p-4">
          <StrategyForm planYear={planYear} strategy={strategy} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

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
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="text-xs font-semibold text-ink-2 hover:text-orange transition-colors whitespace-nowrap disabled:opacity-50"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const err = await call("/api/admin/fundraising/plan/assign", "PATCH", {
          type,
          id,
          strategy_id: strategyId,
        });
        setBusy(false);
        if (err) toast.error(err);
        else router.refresh();
      }}
    >
      {label}
    </button>
  );
}
