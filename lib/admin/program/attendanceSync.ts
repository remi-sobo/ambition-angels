/**
 * The browser side of the offline attendance queue: one shared flush (so the
 * session screen and the shell-level <AttendanceSync> never send the same
 * marks twice at once) and a change signal for "N marks waiting" counters.
 *
 * Client-only. The rules live in attendanceQueue.ts; this file only wires
 * them to IndexedDB, fetch and window events.
 */

import { browserQueue, enqueue, flush, httpSender, pendingMarks, type FlushResult, type PendingMark } from "./attendanceQueue";

const listeners = new Set<() => void>();
let inflight: Promise<FlushResult> | null = null;

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener's failure never blocks the queue.
    }
  });
}

/** Subscribe to queue changes; returns the unsubscribe. */
export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function queueMarks(marks: Omit<PendingMark, "at">[], at = new Date().toISOString()): Promise<void> {
  const q = browserQueue();
  for (const m of marks) await enqueue(q, { ...m, at });
  notify();
}

export async function waitingCount(sessionId?: string): Promise<number> {
  try {
    return (await pendingMarks(browserQueue(), sessionId)).length;
  } catch {
    return 0;
  }
}

/** Send what is waiting, if the browser thinks it is online. One flush at a time. */
export function syncNow(): Promise<FlushResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return waitingCount().then((kept) => ({ sent: 0, kept, rejected: 0 }));
  }
  if (!inflight) {
    inflight = flush(browserQueue(), httpSender)
      .catch(() => ({ sent: 0, kept: 0, rejected: 0 }))
      .finally(() => {
        inflight = null;
        notify();
      });
  }
  return inflight;
}
