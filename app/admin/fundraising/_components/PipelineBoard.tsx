"use client";

// Client pieces of the Major Gifts pipeline: the new-opportunity form and
// the per-card actions (stage moves, edit, lost/reopen). Same convention as
// GrantControls: call the admin APIs, then router.refresh() so the server
// page re-renders with fresh data.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { PIPELINE_STAGES, type OpportunityRow } from "./pipeline-stages";

const inputCls =
  "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-cream text-sm placeholder-gray-mid focus:outline-none focus:border-orange/40";

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
      className="w-full bg-white/[0.03] border border-white/10 rounded-card p-4 grid grid-cols-2 lg:grid-cols-6 gap-3 items-end"
    >
      <label className="col-span-2 text-xs text-gray-mid">
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
      <label className="text-xs text-gray-mid">
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
      <label className="text-xs text-gray-mid">
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
      <label className="text-xs text-gray-mid">
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
          className="text-xs text-gray-mid hover:text-cream px-2"
        >
          Cancel
        </button>
      </div>
      <label className="col-span-2 lg:col-span-4 text-xs text-gray-mid">
        Next move
        <input
          className={`${inputCls} w-full mt-1`}
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          placeholder="Coffee to introduce the spring cohort"
        />
      </label>
      <label className="text-xs text-gray-mid">
        Due
        <input
          className={`${inputCls} w-full mt-1`}
          type="date"
          value={nextStepDue}
          onChange={(e) => setNextStepDue(e.target.value)}
        />
      </label>
      {error && <p className="col-span-full text-red-400 text-xs">{error}</p>}
    </form>
  );
}

function CapacityDots({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" title={`Capacity ${rating}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= rating ? "bg-orange" : "bg-white/15"}`}
        />
      ))}
    </span>
  );
}

export function OpportunityCard({ opp }: { opp: OpportunityRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

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

  const stageIdx = PIPELINE_STAGES.indexOf(opp.stage as (typeof PIPELINE_STAGES)[number]);
  const overdue =
    !!opp.nextStepDue &&
    opp.stage !== "steward" &&
    opp.stage !== "lost" &&
    opp.nextStepDue < new Date().toISOString().slice(0, 10);

  return (
    <article
      className={`bg-[#1d1812] border rounded-xl p-3 text-sm ${
        overdue ? "border-red-500/40" : "border-white/10"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {opp.constituentId ? (
            <Link
              href={`/admin/fundraising/donors/${opp.constituentId}`}
              className="font-semibold text-cream hover:text-orange transition-colors truncate block"
            >
              {opp.label}
            </Link>
          ) : (
            <span className="font-semibold text-cream truncate block">{opp.label}</span>
          )}
          {opp.label !== opp.constituentName && (
            <span className="text-[11px] text-gray-mid truncate block">{opp.constituentName}</span>
          )}
        </div>
        {opp.capacityRating != null && <CapacityDots rating={opp.capacityRating} />}
      </div>

      <div className="flex items-center gap-2 mt-2 text-[12px] text-cream/80 tabular-nums">
        {opp.askAmount != null && <span className="font-semibold">{fmtMoney(opp.askAmount)}</span>}
        {opp.probability != null && (
          <span className="text-gray-mid">{opp.probability}%</span>
        )}
        {opp.owner && (
          <span
            className="ml-auto w-5 h-5 rounded-full bg-white/10 text-[10px] flex items-center justify-center uppercase"
            title={opp.owner}
          >
            {opp.owner.charAt(0)}
          </span>
        )}
      </div>

      {opp.nextStep && (
        <p className={`mt-2 text-[12px] leading-snug ${overdue ? "text-red-300" : "text-gray-mid"}`}>
          {opp.nextStep}
          {opp.nextStepDue && (
            <span className="whitespace-nowrap"> · {opp.nextStepDue.slice(5)}</span>
          )}
        </p>
      )}

      <div className="flex items-center gap-1 mt-3">
        {opp.stage !== "lost" ? (
          <>
            <button
              onClick={() => patch({ stage: PIPELINE_STAGES[stageIdx - 1] })}
              disabled={busy || stageIdx <= 0}
              title="Move back"
              className="px-2 py-1 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-cream/70 disabled:opacity-30"
            >
              ◀
            </button>
            <button
              onClick={() => patch({ stage: PIPELINE_STAGES[stageIdx + 1] })}
              disabled={busy || stageIdx < 0 || stageIdx >= PIPELINE_STAGES.length - 1}
              title="Advance stage"
              className="px-2 py-1 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-cream/70 disabled:opacity-30"
            >
              ▶
            </button>
          </>
        ) : (
          <button
            onClick={() => patch({ stage: "identify" })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-cream/70"
          >
            Reopen
          </button>
        )}
        <button
          onClick={() => setEditing((v) => !v)}
          className="px-2 py-1 rounded-md text-[11px] bg-white/5 hover:bg-white/10 text-cream/70"
        >
          Edit
        </button>
        {opp.stage !== "lost" && opp.stage !== "steward" && (
          <button
            onClick={() => {
              if (confirm("Mark this ask as lost?")) void patch({ stage: "lost" });
            }}
            disabled={busy}
            className="ml-auto px-2 py-1 rounded-md text-[11px] text-gray-mid hover:text-red-300"
          >
            Lost
          </button>
        )}
        {opp.hubspotId && (
          <Link
            href={`/admin/fundraising/prospects/${opp.hubspotId}`}
            className="ml-auto px-2 py-1 rounded-md text-[11px] text-gray-mid hover:text-cream"
            title="Research brief"
          >
            Brief
          </Link>
        )}
      </div>

      {editing && <InlineEdit opp={opp} onDone={() => setEditing(false)} patch={patch} />}
    </article>
  );
}

function InlineEdit({
  opp,
  onDone,
  patch,
}: {
  opp: OpportunityRow;
  onDone: () => void;
  patch: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [ask, setAsk] = useState(opp.askAmount?.toString() ?? "");
  const [probability, setProbability] = useState(opp.probability?.toString() ?? "");
  const [capacity, setCapacity] = useState(opp.capacityRating?.toString() ?? "");
  const [nextStep, setNextStep] = useState(opp.nextStep ?? "");
  const [nextStepDue, setNextStepDue] = useState(opp.nextStepDue ?? "");

  const save = async () => {
    await patch({
      ask_amount: ask === "" ? null : Number(ask),
      probability: probability === "" ? null : Number(probability),
      capacity_rating: capacity === "" ? null : Number(capacity),
      next_step: nextStep || null,
      next_step_due: nextStepDue || null,
    });
    onDone();
  };

  return (
    <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-2">
      <label className="text-[10px] text-gray-mid">
        Ask
        <input className={`${inputCls} w-full mt-0.5 !px-2 !py-1 !text-xs`} type="number" min="0"
          value={ask} onChange={(e) => setAsk(e.target.value)} />
      </label>
      <label className="text-[10px] text-gray-mid">
        Prob %
        <input className={`${inputCls} w-full mt-0.5 !px-2 !py-1 !text-xs`} type="number" min="0" max="100"
          value={probability} onChange={(e) => setProbability(e.target.value)} />
      </label>
      <label className="text-[10px] text-gray-mid">
        Capacity
        <input className={`${inputCls} w-full mt-0.5 !px-2 !py-1 !text-xs`} type="number" min="1" max="5"
          value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </label>
      <label className="col-span-2 text-[10px] text-gray-mid">
        Next move
        <input className={`${inputCls} w-full mt-0.5 !px-2 !py-1 !text-xs`}
          value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
      </label>
      <label className="text-[10px] text-gray-mid">
        Due
        <input className={`${inputCls} w-full mt-0.5 !px-2 !py-1 !text-xs`} type="date"
          value={nextStepDue} onChange={(e) => setNextStepDue(e.target.value)} />
      </label>
      <div className="col-span-3 flex gap-2 justify-end">
        <button onClick={onDone} className="text-[11px] text-gray-mid hover:text-cream px-2 py-1">
          Cancel
        </button>
        <button
          onClick={() => void save()}
          className="text-[11px] font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1 rounded-full"
        >
          Save
        </button>
      </div>
    </div>
  );
}
