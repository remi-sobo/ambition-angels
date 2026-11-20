"use client";

// Decide about one unclear or failed send (G3). Each choice is explicit:
// the worker never resends an unclear email on its own.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";

type Action = "mark_sent" | "send_again" | "mark_bounced";

const DONE: Record<Action, string> = {
  mark_sent: "Marked as sent.",
  send_again: "Queued again. It goes out within a minute.",
  mark_bounced: "Marked as bounced. This address won't get campaigns.",
};

export function SendActions({ campaignId, sendId, status }: { campaignId: string; sendId: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const act = async (action: Action) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/comms/${campaignId}/sends/${sendId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) toast.success(DONE[action]);
      else toast.error(userMessage(res, j));
      router.refresh();
    } catch {
      toast.error(networkMessage());
    } finally {
      setBusy(false);
    }
  };

  const btn = "text-xs font-semibold transition-colors disabled:opacity-50";
  return (
    <span className="flex items-center gap-3 shrink-0">
      {status === "unknown" && (
        <button disabled={busy} onClick={() => act("mark_sent")} className={`${btn} text-ink-2 hover:text-ink-1`}>
          It arrived
        </button>
      )}
      <button disabled={busy} onClick={() => act("send_again")} className={`${btn} text-orange hover:text-orange-dark`}>
        Send again
      </button>
      <button disabled={busy} onClick={() => act("mark_bounced")} className={`${btn} text-ink-3 hover:text-expense`}>
        Bounced
      </button>
    </span>
  );
}
