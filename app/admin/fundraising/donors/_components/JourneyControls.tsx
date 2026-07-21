"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Manual journey enrollment from the donor profile (spec Phase 3). The
// server passes this org's active journeys and why enrollment is blocked
// (do-not-contact / no email), so the disabled state can say why. Cancel is
// the only per-enrollment action — there is no enrollment pause.

export function EnrollInJourney({
  constituentId,
  journeys,
  enrolledJourneyIds,
  disabledReason,
}: {
  constituentId: string;
  /** The org's active journeys (any trigger — open decision 2 as amended). */
  journeys: Array<{ id: string; name: string }>;
  /** Journeys this donor already has an active enrollment in. */
  enrolledJourneyIds: string[];
  /** Why enrollment is blocked for this donor, or null if it isn't. */
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enrolled = new Set(enrolledJourneyIds);
  const options = journeys.filter((j) => !enrolled.has(j.id));

  const enroll = async (journeyId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/journeys/${journeyId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constituent_id: constituentId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not enroll — try again.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (disabledReason) {
    return (
      <span className="text-[11px] text-ink-3" title={disabledReason}>
        Can&apos;t enroll — {disabledReason}
      </span>
    );
  }
  if (journeys.length === 0) return null; // empty state already links to the builder

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value=""
        disabled={busy || options.length === 0}
        onChange={(e) => e.target.value && void enroll(e.target.value)}
        className="bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1 text-ink-1 text-xs focus:outline-none focus:border-orange/40 disabled:opacity-50"
      >
        <option value="">
          {busy ? "Enrolling…" : options.length === 0 ? "In every active journey" : "Enroll in journey…"}
        </option>
        {options.map((j) => (
          <option key={j.id} value={j.id}>
            {j.name}
          </option>
        ))}
      </select>
      {error && <span className="text-[11px] text-expense text-right max-w-[16rem]">{error}</span>}
    </div>
  );
}

export function CancelEnrollment({ enrollmentId, journeyName }: { enrollmentId: string; journeyName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    if (!confirm(`Cancel this enrollment? ${journeyName} will stop sending to this donor.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/journeys/enrollments/${enrollmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "Could not cancel the enrollment.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={() => void cancel()}
      disabled={busy}
      className="text-xs font-semibold text-ink-2 hover:text-expense transition-colors disabled:opacity-50"
    >
      {busy ? "Cancelling…" : "Cancel"}
    </button>
  );
}
