import { waitUntil } from "@vercel/functions";

/**
 * Run work after the HTTP response has been sent, without the client
 * connection gating it. On Vercel, waitUntil keeps the function invocation
 * alive until the promise settles (up to the route's maxDuration), so a
 * research run continues even if the user navigates away. Off Vercel (local
 * `next dev`), there's no execution context — the promise still runs in the
 * Node process; we just swallow the "no context" throw.
 *
 * Fire-and-forget by design: the work owns its own success/failure recording
 * (status row + notification), so we only log if the whole thunk throws.
 */
export function runInBackground(work: () => Promise<void>): void {
  const p = Promise.resolve()
    .then(work)
    .catch((e) => console.error("[background] task threw:", e));
  try {
    waitUntil(p);
  } catch {
    // No Vercel context (local/dev): the promise is already running.
  }
}
