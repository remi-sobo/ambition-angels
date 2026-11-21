"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import Drawer from "@/app/admin/_components/ui/Drawer";
import Button from "@/app/admin/_components/ui/Button";
import { type OpportunityRow } from "./pipeline-stages";
import { type PipelineStage } from "@/lib/fundraising/stages";

/**
 * Full-size edit dialog for a pipeline card (replaces the cramped inline edit
 * panel). The kit Drawer, as TaskEditModal: focus trap, Escape to close,
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
  const confirm = useConfirm();

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
        setError(userMessage(r, body));
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(networkMessage());
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete the ask "${opp.label}"?`,
      body: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/opportunities/${opp.id}`, { method: "DELETE" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(userMessage(r, body));
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(networkMessage());
      setDeleting(false);
    }
  }

  const inputCls =
    "bg-tile border-hairline rounded-control px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40 w-full";
  const labelCls = "text-xs text-ink-2 block";

  return (
    // stopPropagation on pointer events so the board's drag handlers never see
    // gestures that start inside the dialog (the card underneath is draggable).
    <div
      className="contents"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {/* The kit Drawer (V4 P1): focus trap, Escape and scrim close (held
          while a save or delete is in flight), a phone sheet. */}
      <Drawer
        open
        onClose={() => !busy && onClose()}
        width={560}
        title={opp.label}
        description={opp.constituentName && opp.label !== opp.constituentName ? opp.constituentName : undefined}
        footer={
          <div className="flex w-full items-center gap-2">
            <Button variant="quiet" size="sm" onClick={handleDelete} disabled={busy}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" form="opportunity-edit-form" disabled={busy} loading={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        }
      >
        <form id="opportunity-edit-form" onSubmit={submit} className="space-y-4">
          {(opp.constituentId || opp.hubspotId) && (
            <div className="flex items-center gap-3 text-xs">
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
          )}

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

          {error && (
            <p role="alert" className="text-status-critical-text text-sm">
              {error}
            </p>
          )}
        </form>
      </Drawer>
    </div>
  );
}
