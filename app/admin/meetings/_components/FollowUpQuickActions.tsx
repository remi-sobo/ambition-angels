"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Inline actions on a "Needs your follow-up" row, so clearing a personal or
 * irrelevant event doesn't require opening the record: mark it "no follow-up
 * needed" or dismiss it in one click. Recurring exclusion (this + all future
 * occurrences) lives on the detail page, one click in.
 */
export default function FollowUpQuickActions({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function set(status: "none_needed" | "dismissed") {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/meetings/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follow_up_status: status }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error(e);
      alert("Couldn't update. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="shrink-0 inline-flex items-center gap-1">
      <button
        onClick={() => set("none_needed")}
        disabled={busy}
        title="No follow-up needed"
        className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-outline text-ink-2 hover:text-ink-1 hover:bg-tile disabled:opacity-40 transition-colors"
      >
        No follow-up
      </button>
      <button
        onClick={() => set("dismissed")}
        disabled={busy}
        title="Dismiss — hide from this list"
        aria-label="Dismiss"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-ink-3 hover:text-ink-1 hover:bg-tile disabled:opacity-40 transition-colors"
      >
        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}
