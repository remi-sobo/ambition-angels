"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import { TYPE } from "@/lib/admin/typeScale";
import { Button } from "@/app/admin/_components/ui";

/**
 * Close, reopen and archive (specs/fundraising-gift-tables.md, Phase 5).
 *
 * Closing is the moment plan vs actual gets frozen, so it is a deliberate
 * button with a confirmation rather than a status dropdown. Archiving is a
 * separate act from closing: closed means "finished, and here is how it went",
 * archived means "stop showing me this". The API refuses to archive a table
 * that was never closed, so nothing gets filed away with its result unrecorded.
 */

type Action = "close" | "reopen" | "archive" | "unarchive";

type Ask = { title: string; body: string; confirmLabel: string };

const CONFIRM: Partial<Record<Action, Ask>> = {
  close: {
    title: "Close this gift table?",
    body:
      "Plan vs actual is frozen as it stands now, and its next steps leave " +
      "Today's Moves. You can reopen it later; the frozen numbers are kept.",
    confirmLabel: "Close the table",
  },
  reopen: {
    title: "Reopen this gift table?",
    body:
      "It feeds queues again and becomes editable. The numbers from the last " +
      "close are kept, and closing again overwrites them.",
    confirmLabel: "Reopen",
  },
};

const DONE: Record<Action, string> = {
  close: "Closed. Plan vs actual is frozen as of today.",
  reopen: "Reopened. It feeds Today's Moves again.",
  archive: "Archived. It is out of the default list.",
  unarchive: "Back in the list, still closed.",
};

export default function CloseControls({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<Action | null>(null);

  const run = async (action: Action) => {
    const ask = CONFIRM[action];
    if (ask && !(await confirm(ask))) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/fundraising/gift-tables/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        toast.error(userMessage(res, await res.json().catch(() => ({}))));
        return;
      }
      toast.success(DONE[action]);
      router.refresh();
    } catch {
      toast.error(networkMessage());
    } finally {
      setBusy(null);
    }
  };

  const label = (a: Action, idle: string) => (busy === a ? "Working…" : idle);

  if (status === "active") {
    return (
      <Button variant="secondary" size="sm" onClick={() => run("close")} disabled={!!busy}>
        {label("close", "Close the table")}
      </Button>
    );
  }

  if (status === "closed") {
    return (
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => run("reopen")} disabled={!!busy}>
          {label("reopen", "Reopen")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => run("archive")} disabled={!!busy}>
          {label("archive", "Archive")}
        </Button>
      </div>
    );
  }

  if (status === "archived") {
    return (
      <div className="flex items-center gap-2">
        <span className={TYPE.metadata}>Archived</span>
        <Button variant="ghost" size="sm" onClick={() => run("unarchive")} disabled={!!busy}>
          {label("unarchive", "Unarchive")}
        </Button>
      </div>
    );
  }

  // A draft has nothing to close: there is no result to freeze.
  return null;
}
