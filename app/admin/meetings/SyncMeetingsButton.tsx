"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Pull past external calendar events into matched meeting records. Idempotent. */
export default function SyncMeetingsButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/meetings/sync", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Meetings sync failed:", e);
      alert("Couldn't sync meetings. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={sync}
      disabled={busy}
      className="text-xs font-medium px-3 py-1.5 rounded bg-orange/15 text-orange border border-orange/30 hover:bg-orange/25 disabled:opacity-50 transition-colors"
    >
      {busy ? "Syncing…" : "Sync from calendar"}
    </button>
  );
}
