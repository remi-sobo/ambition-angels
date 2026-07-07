"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusChip } from "../../../../_components/StatusChip";
import type { RaterForm, ReviewCompetency } from "../../../_lib/reviews";

const CARD = "rounded-card border-[1.5px] border-outline bg-tile shadow-tile";
const FIELD = "w-full rounded-md border border-outline bg-surface px-2 py-1.5 text-sm text-ink-1 placeholder:text-ink-3";

const REL_LABEL: Record<string, string> = {
  self: "Self-review",
  manager: "Manager (downward)",
  report: "Upward (about your manager)",
  peer: "Peer",
};

function FormCard({ form, competencies }: { form: RaterForm; competencies: ReviewCompetency[] }) {
  const router = useRouter();
  const [ratings, setRatings] = useState<Record<string, number>>(form.ratings ?? {});
  const [strengths, setStrengths] = useState(form.strengths ?? "");
  const [growth, setGrowth] = useState(form.growth ?? "");
  const [comments, setComments] = useState(form.comments ?? "");
  const [busy, setBusy] = useState(false);
  const submitted = form.status === "submitted";

  async function save(submit: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/staff/reviews/feedback/${form.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratings, strengths, growth, comments, submit }),
      });
      if (res.ok) router.refresh();
      else alert(((await res.json().catch(() => null)) as { error?: string })?.error ?? "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${CARD} p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-1">{form.subject_name}</p>
          <p className="text-xs text-ink-2">{REL_LABEL[form.relationship] ?? form.relationship}</p>
        </div>
        <StatusChip status={submitted ? "healthy" : "due"}>{submitted ? "Submitted" : "Pending"}</StatusChip>
      </div>

      <div className="flex flex-col gap-2">
        {competencies.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-1" title={c.description ?? undefined}>
              {c.name}
            </span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy || submitted}
                  onClick={() => setRatings((r) => ({ ...r, [c.id]: n }))}
                  className={`w-7 h-7 rounded-md text-xs font-semibold border ${
                    ratings[c.id] === n
                      ? "bg-orange text-white border-orange"
                      : "bg-surface text-ink-2 border-outline hover:border-orange/50"
                  } disabled:opacity-60`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <textarea
        className={FIELD}
        rows={2}
        placeholder="Strengths"
        value={strengths}
        disabled={submitted}
        onChange={(e) => setStrengths(e.target.value)}
      />
      <textarea
        className={FIELD}
        rows={2}
        placeholder="Areas to grow"
        value={growth}
        disabled={submitted}
        onChange={(e) => setGrowth(e.target.value)}
      />
      <textarea
        className={FIELD}
        rows={2}
        placeholder="Anything else"
        value={comments}
        disabled={submitted}
        onChange={(e) => setComments(e.target.value)}
      />

      {!submitted && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => save(false)}
            className="rounded-md border border-outline px-3 py-1 text-sm font-semibold text-ink-1 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => save(true)}
            className="rounded-md bg-orange px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}

export default function RaterFormsClient({
  forms,
  competencies,
}: {
  forms: RaterForm[];
  competencies: ReviewCompetency[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {forms.map((f) => (
        <FormCard key={f.id} form={f} competencies={competencies} />
      ))}
    </div>
  );
}
