"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";
import { type OpportunityRow } from "./pipeline-stages";
import { type PipelineStage } from "@/lib/fundraising/stages";

/**
 * Full-size edit dialog for a pipeline card (replaces the cramped inline edit
 * panel). Mirrors TaskEditModal's shell: dimmed backdrop, Escape to close,
 * one PATCH with every editable field on save. Stage comes from the card's
 * pipeline config, so the dropdown always matches the board's columns.
 */
export default function OpportunityEditModal({
  opp,
  stages,
  onClose,
}: {
  opp: OpportunityRow;
  stages: PipelineStage[];
  onClose: () => void;
}) {
  const router = useRouter();

  const [name, setName] = useState(opp.label);
  const [stage, setStage] = useState(opp.stage);
  const [ask, setAsk] = useState(opp.askAmount?.toString() ?? "");
  const [probability, setProbability] = useState(opp.probability?.toString() ?? "");
  const [capacity, setCapacity] = useState(opp.capacityRating?.toString() ?? "");
  const [affinity, setAffinity] = useState(opp.affinityRating?.toString() ?? "");
  const [expectedClose, setExpectedClose] = useState(opp.expectedClose ?? "");
  const [owner, setOwner] = useState(opp.owner ?? "");
  const [nextStep, setNextStep] = useState(opp.nextStep ?? "");
  const [nextStepDue, setNextStepDue] = useState(opp.nextStepDue ?? "");
  const [notes, setNotes] = useState(opp.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving || deleting;

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/opportunities/${opp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          stage,
          ask_amount: ask === "" ? null : Number(ask),
          probability: probability === "" ? null : Number(probability),
          capacity_rating: capacity === "" ? null : Number(capacity),
          affinity_rating: affinity === "" ? null : Number(affinity),
          expected_close: expectedClose || null,
          owner: owner.trim() || null,
          next_step: nextStep.trim() || null,
          next_step_due: nextStepDue || null,
          notes: notes.trim() || null,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete the ask "${opp.label}"? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/opportunities/${opp.id}`, { method: "DELETE" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  const inputCls =
    "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40 w-full";
  const labelCls = "text-xs text-ink-2 block";

  return (
    // stopPropagation on pointer events so the board's drag handlers never see
    // gestures that start inside the dialog (the card underneath is draggable).
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={() => !busy && onClose()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-card border-[1.5px] border-outline bg-ink shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className={TYPE.modalTitle}>{opp.label}</h2>
              {opp.constituentName && opp.label !== opp.constituentName && (
                <p className="text-xs text-ink-2 mt-0.5 truncate">{opp.constituentName}</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs">
              {opp.constituentId && (
                <Link
                  href={`/admin/fundraising/donors/${opp.constituentId}`}
                  className="font-semibold text-orange hover:text-orange-dark transition-colors"
                >
                  Donor 360 →
                </Link>
              )}
              {opp.hubspotId && (
                <Link
                  href={`/admin/fundraising/prospects/by-hubspot/${opp.hubspotId}`}
                  className="font-semibold text-orange hover:text-orange-dark transition-colors"
                >
                  Brief →
                </Link>
              )}
            </div>
          </div>

          <label className={labelCls}>
            Deal name
            <input
              className={`${inputCls} mt-1`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={opp.constituentName || "FY27 leadership ask"}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Stage
              <select
                className={`${inputCls} mt-1`}
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              >
                {!stages.some((s) => s.key === stage) && (
                  <option value={stage}>{stage}</option>
                )}
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Owner
              <input
                className={`${inputCls} mt-1`}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="owner"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <label className={labelCls}>
              Ask amount
              <input
                className={`${inputCls} mt-1`}
                type="number"
                min="0"
                step="100"
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder="25000"
              />
            </label>
            <label className={labelCls}>
              Probability %
              <input
                className={`${inputCls} mt-1`}
                type="number"
                min="0"
                max="100"
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
              />
            </label>
            <label className={labelCls}>
              Capacity (1–5)
              <input
                className={`${inputCls} mt-1`}
                type="number"
                min="1"
                max="5"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </label>
            <label className={labelCls}>
              Affinity (1–5)
              <input
                className={`${inputCls} mt-1`}
                type="number"
                min="1"
                max="5"
                value={affinity}
                onChange={(e) => setAffinity(e.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Expected close
              <input
                className={`${inputCls} mt-1`}
                type="date"
                value={expectedClose}
                onChange={(e) => setExpectedClose(e.target.value)}
              />
            </label>
            <label className={labelCls}>
              Next move due
              <input
                className={`${inputCls} mt-1`}
                type="date"
                value={nextStepDue}
                onChange={(e) => setNextStepDue(e.target.value)}
              />
            </label>
          </div>

          <label className={labelCls}>
            Next move
            <input
              className={`${inputCls} mt-1`}
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="Coffee to introduce the spring cohort"
            />
          </label>

          <label className={labelCls}>
            Notes
            <textarea
              className={`${inputCls} mt-1 min-h-[96px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context, history, who warms the intro…"
            />
          </label>

          {error && <p className="text-expense text-sm">{error}</p>}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="px-3 py-2 rounded-full text-xs text-ink-2 hover:text-expense transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 text-xs text-ink-2 hover:text-ink-1 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-5 py-2 rounded-full transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
