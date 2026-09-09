"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";

// Start a thankathon: group every pending thank-you under one parent task with
// a shared call script. The matrix already created most of these tasks; this
// batches them for a focused calling session.
export default function ThankathonButton({ count }: { count: number }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    const ok = await confirm({
      title: `Start a thankathon for ${count} pending thank-you${count === 1 ? "" : "s"}?`,
      body: "They'll be grouped under one call task with a shared script.",
      confirmLabel: "Start thankathon",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/acknowledgments/thankathon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(userMessage(res, j));
        return;
      }
      router.refresh();
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  if (count === 0) return null;
  return (
    <span className="flex items-center gap-2">
      <button
        onClick={start}
        disabled={busy}
        className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors disabled:opacity-50"
      >
        {busy ? "Starting…" : "Start thankathon"}
      </button>
      {error && <span className="text-expense text-xs">{error}</span>}
    </span>
  );
}
