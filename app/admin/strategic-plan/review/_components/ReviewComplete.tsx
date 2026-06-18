"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Closes out a monthly OGSM review: capture notes + the next review date, log
// the session, and return to the plan. The KPI/status edits happen live in the
// objective cards above — this just records the ritual.
const inputCls =
  "bg-tile border-[1.5px] border-outline rounded-lg px-3 py-2 text-ink-1 text-sm placeholder-ink-3 focus:outline-none focus:border-orange/40";

function defaultNextReview(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ReviewComplete() {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [nextReview, setNextReview] = useState(defaultNextReview());
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/plan/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes || undefined, next_review_at: nextReview || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
        return;
      }
      router.push("/admin/strategic-plan");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="bg-surface border-[1.5px] border-outline rounded-card-lg p-5 space-y-3"
    >
      <h2 className="font-heading font-semibold text-ink-1">Close out the review</h2>
      <label className="block text-xs text-ink-2">
        Notes — decisions, blockers, what changed
        <textarea
          className={`${inputCls} w-full mt-1`}
          rows={4}
          value={notes}
          placeholder="e.g. Fundraising on pace; recruitment behind — shifting Q3 focus to the partner playbook…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink-2">
          Next review date
          <input
            type="date"
            className={`${inputCls} block mt-1`}
            value={nextReview}
            onChange={(e) => setNextReview(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
        >
          {busy ? "Logging…" : "Log review & finish"}
        </button>
      </div>
    </form>
  );
}
