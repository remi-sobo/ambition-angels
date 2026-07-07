"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SectionHeading from "../../../_components/SectionHeading";
import EmptyState from "../../../_components/EmptyState";
import { StatusChip } from "../../../_components/StatusChip";
import type { SubjectReviewCycle, ReviewCompetency } from "../../_lib/reviews";

const CARD = "rounded-card border-[1.5px] border-outline bg-tile shadow-tile";
const FIELD = "w-full rounded-md border border-outline bg-surface px-2 py-1.5 text-sm text-ink-1 placeholder:text-ink-3";

const REL_LABEL: Record<string, string> = {
  self: "Self", manager: "Manager", report: "Upward", peer: "Peer",
};

function avg(ratings: Record<string, number>): string {
  const vals = Object.values(ratings ?? {});
  if (!vals.length) return "—";
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

function CycleBlock({
  subjectStaffId,
  data,
}: {
  subjectStaffId: string;
  data: SubjectReviewCycle;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(data.summary ?? "");
  const [notes, setNotes] = useState(data.managerNotes ?? "");
  const [busy, setBusy] = useState(false);

  async function save(share: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/staff/reviews/${data.cycle.id}/summary/${subjectStaffId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, notes, share }),
      });
      if (res.ok) router.refresh();
      else alert(((await res.json().catch(() => null)) as { error?: string })?.error ?? "Failed.");
    } finally {
      setBusy(false);
    }
  }

  const submitted = data.feedback.filter((f) => f.status === "submitted");

  return (
    <div className={`${CARD} p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-1">{data.cycle.name}</p>
        <StatusChip status={data.cycle.status === "shared" ? "healthy" : "neutral"}>
          {data.cycle.anonymity_mode}
        </StatusChip>
      </div>

      {/* Shared summary (what the subject sees) */}
      {data.canSynthesize ? (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-3">Synthesis (shared with subject)</label>
          <textarea className={FIELD} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summarize the feedback for the subject…" />
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-3">
            Private manager notes (never shown to the subject)
          </label>
          <textarea className={FIELD} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="For your eyes / the org's record…" />
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => save(false)} className="rounded-md border border-outline px-3 py-1 text-sm font-semibold text-ink-1 disabled:opacity-50">
              Save
            </button>
            <button type="button" disabled={busy} onClick={() => save(true)} className="rounded-md bg-orange px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
              Save & share
            </button>
            {data.summaryShared && <span className="text-xs text-status-healthy">Shared with subject</span>}
          </div>
        </div>
      ) : data.summary && data.summaryShared ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3 mb-1">Summary</p>
          <p className="text-sm text-ink-1 whitespace-pre-wrap">{data.summary}</p>
        </div>
      ) : (
        <p className="text-xs text-ink-2">Your summary hasn’t been shared yet.</p>
      )}

      {/* Feedback rows the viewer is allowed to see */}
      {submitted.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-outline pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Feedback</p>
          {submitted.map((f) => (
            <div key={f.id} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-ink-3">{REL_LABEL[f.relationship] ?? f.relationship}</span>
                <span className="text-ink-2">· {f.rater_name ?? "Anonymous"}</span>
                <span className="text-ink-3">· avg {avg(f.ratings)}</span>
              </div>
              {f.strengths && <p className="text-ink-1 mt-0.5"><span className="text-ink-3">Strengths:</span> {f.strengths}</p>}
              {f.growth && <p className="text-ink-1"><span className="text-ink-3">Grow:</span> {f.growth}</p>}
              {f.comments && <p className="text-ink-1"><span className="text-ink-3">More:</span> {f.comments}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReviewsSection({
  subjectStaffId,
  cycles,
}: {
  subjectStaffId: string;
  cycles: SubjectReviewCycle[];
  competencies: ReviewCompetency[];
}) {
  return (
    <section>
      <SectionHeading className="mb-3">Reviews</SectionHeading>
      {cycles.length === 0 ? (
        <EmptyState
          label="Reviews"
          hint="360 cycles appear here. Create one under Staff → Reviews and generate assignments from the chart."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {cycles.map((c) => (
            <CycleBlock key={c.cycle.id} subjectStaffId={subjectStaffId} data={c} />
          ))}
        </div>
      )}
    </section>
  );
}
