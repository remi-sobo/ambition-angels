"use client";

// Hide / unhide control for a logged email on the Constituent 360 timeline
// (Phase 1C.c). Hidden threads stay on the spine (durable against re-sync) but
// drop out of the visible timeline.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function EmailActions({
  interactionId,
  isPrivate,
}: {
  interactionId: string;
  isPrivate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  const toggle = () => {
    setBusy(true);
    void fetch(`/api/admin/fundraising/interactions/${interactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_private: !isPrivate }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        start(() => router.refresh());
      })
      .catch(() => alert("Could not update — try again."))
      .finally(() => setBusy(false));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || pending}
      className="text-[10px] font-semibold text-ink-3 hover:text-ink-1 transition-colors disabled:opacity-50"
    >
      {busy || pending ? "…" : isPrivate ? "Unhide" : "Hide"}
    </button>
  );
}
