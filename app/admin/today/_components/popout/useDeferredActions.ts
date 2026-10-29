"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TodayObligation } from "@/lib/admin/today";

/**
 * Done and Snooze on Needs you are optimistic and reversible: the row leaves
 * the list at once, an undo bar counts down UNDO_MS, and only then does the
 * write go out. Undo before that is free: nothing was written, so there is no
 * reverse write to get wrong (compliance filings, gift acknowledgments and
 * grant submissions have no clean inverse). Leaving the page inside the window
 * flushes the write with keepalive, so a Done is never silently dropped.
 */

export const UNDO_MS = 5000;

export type DeferredAction = {
  action: "resolve" | "snooze";
  until?: string;
  /** Thank-yous: how it was done (letter, call, email…), logged by /mark. */
  channel?: string;
  /** Thank-yous: folded escalation tasks to close with it, by request. */
  alsoClose?: string[];
};

export type PendingItem = DeferredAction & {
  row: TodayObligation;
  /** When the write goes out (epoch ms), for the countdown. */
  commitAt: number;
};

/** The write itself. A thank-you's Done goes through the acknowledgments
 *  path (stamps acknowledged_at, closes the ack task, logs the touch); every
 *  other type through the A3 obligation RPCs. `wrote` is whether the main
 *  write landed (a follow-up can still fail after it); `error` says what
 *  went wrong, if anything. */
export type SendResult = { wrote: boolean; error: string | null };
export async function sendObligationAction(
  row: TodayObligation,
  a: DeferredAction,
  keepalive = false,
): Promise<SendResult> {
  const init = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive,
  });
  try {
    const r =
      row.type === "acknowledgment" && a.action === "resolve"
        ? await fetch("/api/admin/acknowledgments/mark", init({ gift_id: row.source_id, channel: a.channel }))
        : await fetch(
            "/api/admin/obligations",
            init({ action: a.action, source: row.type, sourceId: row.source_id, until: a.until }),
          );
    if (!r.ok) {
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      return { wrote: false, error: j?.error ?? "Something went wrong." };
    }
    // The thank-you is recorded; now the tasks the person chose to close
    // with it. A failure here can't un-thank the gift, so it says so plainly.
    const stuck: string[] = [];
    for (const id of a.alsoClose ?? []) {
      const t = await fetch(
        "/api/admin/obligations",
        init({ action: "resolve", source: "ops_task", sourceId: id }),
      ).catch(() => null);
      if (!t?.ok) stuck.push(id);
    }
    return {
      wrote: true,
      error: stuck.length
        ? `Marked thanked, but ${stuck.length === 1 ? "a linked task" : `${stuck.length} linked tasks`} couldn't be closed. Close ${stuck.length === 1 ? "it" : "them"} from the task list.`
        : null,
    };
  } catch {
    return { wrote: false, error: "Couldn't reach BloomOS. Check your connection and try again." };
  }
}

export function useDeferredActions({
  onCommitted,
  onFailed,
}: {
  onCommitted: () => void;
  /** `wrote`: the main write landed and only a follow-up failed, so the row
   *  must stay gone (the refresh will drop it). */
  onFailed: (row: TodayObligation, message: string, wrote: boolean) => void;
}) {
  const [pending, setPending] = useState<PendingItem[]>([]);
  const timers = useRef(new Map<string, number>());
  const pendingRef = useRef<PendingItem[]>([]);
  pendingRef.current = pending;
  const cb = useRef({ onCommitted, onFailed });
  cb.current = { onCommitted, onFailed };

  const commit = useCallback(async (id: string) => {
    timers.current.delete(id);
    const item = pendingRef.current.find((p) => p.row.id === id);
    if (!item) return;
    const res = await sendObligationAction(item.row, item);
    setPending((prev) => prev.filter((p) => p.row.id !== id));
    if (res.wrote) cb.current.onCommitted();
    if (res.error) cb.current.onFailed(item.row, res.error, res.wrote);
  }, []);

  const schedule = useCallback(
    (row: TodayObligation, a: DeferredAction) => {
      if (timers.current.has(row.id)) return;
      const commitAt = Date.now() + UNDO_MS;
      setPending((prev) => [...prev, { row, ...a, commitAt }]);
      timers.current.set(row.id, window.setTimeout(() => void commit(row.id), UNDO_MS));
    },
    [commit],
  );

  const undo = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t === undefined) return; // already sending: too late to undo
    window.clearTimeout(t);
    timers.current.delete(id);
    setPending((prev) => prev.filter((p) => p.row.id !== id));
  }, []);

  // Leaving the page (navigation, tab close, unmount) sends whatever is still
  // waiting, with keepalive so the request outlives the page.
  useEffect(() => {
    const flush = () => {
      for (const [id, t] of Array.from(timers.current.entries())) {
        window.clearTimeout(t);
        const item = pendingRef.current.find((p) => p.row.id === id);
        if (item) void sendObligationAction(item.row, item, true);
      }
      timers.current.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  return { pending, schedule, undo };
}
