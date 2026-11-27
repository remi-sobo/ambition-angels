"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { OUTCOME_LABEL, type Outcome } from "@/lib/admin/ops/close";

/**
 * The outcome line under a committed task on Friday Close (Weekly Plan v2,
 * PR 4). Shows the outcome derived from the task's state; the task's own
 * Done / Roll / Drop buttons move it. "Partly done" is the one outcome saved
 * directly on the commitment, and it can be undone.
 */
const TONE: Record<Outcome, string> = {
  done: "text-revenue",
  partial: "text-status-watch-text",
  missed: "text-expense",
  deferred: "text-ink-2",
  dropped: "text-ink-3",
};

export default function CommitmentOutcome({
  commitmentId,
  outcome,
  canMarkPartial,
  placementNote,
}: {
  commitmentId: string;
  outcome: Outcome;
  /** Only an open task can be partly done. */
  canMarkPartial: boolean;
  placementNote: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function setPartial(on: boolean) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ops/commitments/${commitmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: on ? "partial" : null }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Outcome save failed:", e);
      toast.error("Couldn't save the outcome. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-xs pl-3 flex items-center gap-2 flex-wrap">
      <span className={`font-semibold uppercase tracking-wider ${TONE[outcome]}`}>
        {OUTCOME_LABEL[outcome]}
      </span>
      {placementNote && <span className="text-ink-3">{placementNote}</span>}
      {canMarkPartial && outcome !== "partial" && (
        <button
          type="button"
          onClick={() => setPartial(true)}
          disabled={busy}
          className="text-ink-2 hover:text-ink-1 underline underline-offset-2 disabled:opacity-50"
        >
          Partly done
        </button>
      )}
      {outcome === "partial" && (
        <button
          type="button"
          onClick={() => setPartial(false)}
          disabled={busy}
          className="text-ink-2 hover:text-ink-1 underline underline-offset-2 disabled:opacity-50"
        >
          Undo partly done
        </button>
      )}
    </div>
  );
}
