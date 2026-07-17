"use client";

// Client pieces of the Major Gifts pipeline: the new-opportunity form and
// the per-card actions (stage moves, edit, lost/reopen). Same convention as
// GrantControls: call the admin APIs, then router.refresh() so the server
// page re-renders with fresh data.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { type OpportunityRow } from "./pipeline-stages";
import {
  firstOpenStageKey,
  stageKeysOfType,
  type PipelineStage,
} from "@/lib/fundraising/stages";
import { isLostStage, isWonStage } from "@/lib/fundraising/stage-sets";
import OpportunityEditModal from "./OpportunityEditModal";

const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function NewOpportunityForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [ask, setAsk] = useState("");
  const [probability, setProbability] = useState("");
  const [capacity, setCapacity] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextStepDue, setNextStepDue] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constituent_name: name,
          ask_amount: ask ? Number(ask) : undefined,
          probability: probability ? Number(probability) : undefined,
          capacity_rating: capacity ? Number(capacity) : undefined,
          next_step: nextStep || undefined,
          next_step_due: nextStepDue || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (j.warning) alert(j.warning);
      setName(""); setAsk(""); setProbability(""); setCapacity("");
      setNextStep(""); setNextStepDue("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create opportunity");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors"
      >
        + New ask
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-full bg-surface shadow-panel border-[1.5px] border-outline rounded-card p-4 grid grid-cols-2 lg:grid-cols-6 gap-3 items-end"
    >
      <label className="col-span-2 text-xs text-ink-2">
        Donor / prospect name
        <input
          className={`${inputCls} w-full mt-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe or Acme Foundation"
          required
          autoFocus
        />
      </label>
      <label className="text-xs text-ink-2">
        Ask amount
        <input
          className={`${inputCls} w-full mt-1`}
          type="number"
          min="0"
          step="100"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="25000"
        />
      </label>
      <label className="text-xs text-ink-2">
        Probability %
        <input
          className={`${inputCls} w-full mt-1`}
          type="number"
          min="0"
          max="100"
          value={probability}
          onChange={(e) => setProbability(e.target.value)}
          placeholder="50"
        />
      </label>
      <label className="text-xs text-ink-2">
        Capacity (1–5)
        <input
          className={`${inputCls} w-full mt-1`}
          type="number"
          min="1"
          max="5"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="3"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
        >
          {busy ? "Saving…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-ink-2 hover:text-ink-1 px-2"
        >
          Cancel
        </button>
      </div>
      <label className="col-span-2 lg:col-span-4 text-xs text-ink-2">
        Next move
        <input
          className={`${inputCls} w-full mt-1`}
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          placeholder="Coffee to introduce the spring cohort"
        />
      </label>
      <label className="text-xs text-ink-2">
        Due
        <input
          className={`${inputCls} w-full mt-1`}
          type="date"
          value={nextStepDue}
          onChange={(e) => setNextStepDue(e.target.value)}
        />
      </label>
      {error && <p className="col-span-full text-expense text-xs">{error}</p>}
    </form>
  );
}

function CapacityDots({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" title={`Capacity ${rating}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= rating ? "bg-orange" : "bg-tile"}`}
        />
      ))}
    </span>
  );
}

export function OpportunityCard({
  opp,
  stages,
}: {
  opp: OpportunityRow;
  /** The card's pipeline config (drives the Lost / Reopen actions). */
  stages: PipelineStage[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  // Stage semantics come from config; fall back to the cross-taxonomy sets for
  // a card whose stage key isn't in this pipeline's config (stale data).
  const stageType =
    stages.find((s) => s.key === opp.stage)?.stageType ??
    (isWonStage(opp.stage) ? "won" : isLostStage(opp.stage) ? "lost" : "open");
  const lostKey = stageKeysOfType(stages, "lost")[0] ?? null;
  const reopenKey = firstOpenStageKey(stages);

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/opportunities/${opp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const overdue =
    !!opp.nextStepDue &&
    stageType === "open" &&
    opp.nextStepDue < new Date().toISOString().slice(0, 10);

  return (
    <article
      className={`bg-surface border rounded-xl p-3 text-sm ${
        overdue ? "border-expense/30" : "border-outline"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {opp.constituentId ? (
            <Link
              href={`/admin/fundraising/donors/${opp.constituentId}`}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-ink-1 hover:text-orange transition-colors truncate block"
            >
              {opp.label}
            </Link>
          ) : (
            <span className="font-semibold text-ink-1 truncate block">{opp.label}</span>
          )}
          {opp.constituentName && opp.label !== opp.constituentName && (
            <span className="text-[11px] text-ink-2 truncate block">{opp.constituentName}</span>
          )}
        </div>
        {opp.capacityRating != null && <CapacityDots rating={opp.capacityRating} />}
      </div>

      <div className="flex items-center gap-2 mt-2 text-[12px] text-ink-1 tabular-nums">
        {opp.askAmount != null && <span className="font-semibold">{fmtMoney(opp.askAmount)}</span>}
        {opp.probability != null && (
          <span className="text-ink-2">{opp.probability}%</span>
        )}
        {opp.owner && (
          <span
            className="ml-auto w-5 h-5 rounded-full bg-tile text-[10px] flex items-center justify-center uppercase"
            title={opp.owner}
          >
            {opp.owner.charAt(0)}
          </span>
        )}
      </div>

      {opp.nextStep && (
        <p className={`mt-2 text-[12px] leading-snug ${overdue ? "text-expense" : "text-ink-2"}`}>
          {opp.nextStep}
          {opp.nextStepDue && (
            <span className="whitespace-nowrap"> · {opp.nextStepDue.slice(5)}</span>
          )}
        </p>
      )}

      <div className="flex items-center gap-1 mt-3">
        {stageType === "lost" && (
          <button
            onClick={() => patch({ stage: reopenKey })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2"
          >
            Reopen
          </button>
        )}
        <button
          onClick={() => setEditing((v) => !v)}
          className="px-2 py-1 rounded-md text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2"
        >
          Edit
        </button>
        {stageType !== "lost" && stageType !== "won" && lostKey && (
          <button
            onClick={() => {
              if (confirm("Mark this ask as lost?")) void patch({ stage: lostKey });
            }}
            disabled={busy}
            className="ml-auto px-2 py-1 rounded-md text-[11px] text-ink-2 hover:text-expense"
          >
            Lost
          </button>
        )}
        {opp.hubspotId && (
          <Link
            href={`/admin/fundraising/prospects/by-hubspot/${opp.hubspotId}`}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className="ml-auto px-2 py-1 rounded-md text-[11px] text-ink-2 hover:text-ink-1"
            title="Research brief"
          >
            Brief
          </Link>
        )}
      </div>

      {editing && (
        <OpportunityEditModal opp={opp} stages={stages} onClose={() => setEditing(false)} />
      )}
    </article>
  );
}
