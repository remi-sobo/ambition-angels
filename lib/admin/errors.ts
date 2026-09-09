/**
 * Quality Floor Q2 (specs/bloomos-v2-spec-quality-floor.md) — the one
 * function between a failed fetch and the person reading about it.
 *
 * The audit's F2: 90+ call sites forward the transport layer straight to
 * the user — `alert(j.error ?? \`HTTP ${res.status}\`)` — so a failed grant
 * save reads "HTTP 500" in a browser dialog. This module is the fix's
 * contract: it maps a response to a sentence a director can act on, and it
 * NEVER returns a bare status code. The status belongs in logs (the caller
 * keeps `console.error`/observability); the person gets what failed and
 * what to do. PURE — tests feed it fixtures.
 */

type JsonBody = { error?: unknown; message?: unknown } | null | undefined;

/** A server-provided message is shown only when it reads like a sentence
 *  for a person: non-empty, not a status-code echo, not a stack/internal
 *  blob. Anything else falls back to the status-class sentence. */
function humanServerMessage(json: JsonBody): string | null {
  const raw =
    json && typeof json === "object"
      ? typeof json.error === "string"
        ? json.error
        : typeof json.message === "string"
          ? json.message
          : null
      : null;
  if (!raw) return null;
  const msg = raw.trim();
  if (!msg || msg.length > 200) return null;
  if (/^https?\b/i.test(msg)) return null; // "HTTP 500", a URL, …
  if (/\b[45]\d\d\b/.test(msg)) return null; // any status code echo
  if (/\bat\s+\S+\.(ts|js|tsx)\b|\bstack\b/i.test(msg)) return null;
  return msg;
}

/**
 * The sentence to show for a failed response. Prefer the server's message
 * when it's fit for a person; otherwise speak for the status CLASS, never
 * the code.
 */
export function userMessage(
  res: { status: number },
  json?: JsonBody,
): string {
  const server = humanServerMessage(json);
  if (server) return server;

  const s = res.status;
  if (s === 401) return "Your session has expired. Sign in again and retry.";
  if (s === 403) return "You don't have permission for that. An owner can grant it in Settings.";
  if (s === 404) return "That record wasn't found. It may have been removed — refresh and try again.";
  if (s === 409) return "That couldn't be completed because something it depends on changed. Refresh to see the current state.";
  if (s === 422 || s === 400) return "Something in the form isn't valid. Check the fields and try again.";
  if (s === 429) return "Too many requests at once. Wait a moment and try again.";
  if (s >= 500) return "Something failed on our side. Your changes were not saved. Try again, and tell Remi if it keeps happening.";
  return "That didn't go through. Try again, and tell Remi if it keeps happening.";
}

/** For thrown fetches (network down, CORS, aborted) — no response at all. */
export function networkMessage(): string {
  return "Couldn't reach BloomOS. Check your connection and try again — nothing was saved.";
}
