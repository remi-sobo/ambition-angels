/**
 * Lazy HubSpot HTTP client.
 *
 * Mirrors the pattern in lib/supabase/admin.ts: missing env vars surface at
 * first call, not at module import (so build-time page-data collection
 * doesn't crash when HUBSPOT_ACCESS_TOKEN is unset locally).
 *
 * Uses built-in fetch — no axios, no @hubspot/api-client.
 *
 * NEVER log the access token. The HubSpotError below intentionally omits it
 * from the message and the error never carries the headers object.
 */

const HUBSPOT_BASE_URL = "https://api.hubapi.com";

export class HubSpotError extends Error {
  status: number;
  bodyPreview: string;

  constructor(status: number, bodyPreview: string, path: string) {
    super(`${describeStatus(status)} on ${path}: ${bodyPreview.slice(0, 200)}`);
    this.name = "HubSpotError";
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
}

// A specific, actionable prefix per status class — this is what ends up on
// the job's error list and, from there, in the Settings UI, so it needs to
// tell a human what to actually do rather than just "HubSpot 403".
function describeStatus(status: number): string {
  if (status === 401) return "HubSpot 401 (access token invalid or expired — reconnect the integration)";
  if (status === 403) return "HubSpot 403 (the access token is missing a required scope for this object)";
  if (status === 429) return "HubSpot 429 (rate limited)";
  if (status >= 500) return `HubSpot ${status} (HubSpot server error)`;
  return `HubSpot ${status}`;
}

// Transient statuses worth a couple of retries before giving up: rate limits
// and momentary server hiccups. Anything else (4xx auth/scope/shape errors)
// won't succeed on retry, so we fail fast instead of stalling the chunk.
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Honors HubSpot's Retry-After header (seconds) when present, otherwise
// backs off exponentially (500ms, 1s, 2s).
function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  }
  return 500 * 2 ** attempt;
}

let cachedToken: string | null = null;

function getToken(): string {
  if (cachedToken) return cachedToken;
  const t = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!t) {
    throw new Error(
      "HubSpot client: HUBSPOT_ACCESS_TOKEN must be set"
    );
  }
  cachedToken = t;
  return t;
}

/**
 * GET an absolute path on api.hubapi.com with bearer auth.
 *
 * `path` should start with a slash (e.g. "/crm/v3/objects/contacts"). Query
 * params are caller-built — most fetchers compose `?properties=…&limit=…`.
 *
 * Retries once-per-backoff on 429 / 5xx (up to MAX_RETRIES) before giving up
 * — a single transient rate-limit or server hiccup on one step used to
 * permanently hard-fail that step for the whole sync run, which is why a run
 * could land "partial" at almost the same point every time. Throws
 * HubSpotError on a non-2xx that isn't retryable, or once retries are
 * exhausted. Body preview is included for debugging but the token is never
 * serialized.
 */
export async function hubspotGet<T = unknown>(path: string): Promise<T> {
  const token = getToken();
  let lastError: HubSpotError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // No caching at the platform layer; we own caching via hs_* tables.
      cache: "no-store",
    });

    if (res.ok) return (await res.json()) as T;

    const body = await res.text().catch(() => "");
    lastError = new HubSpotError(res.status, body, path);

    if (!isRetryable(res.status) || attempt === MAX_RETRIES) throw lastError;
    await sleep(retryDelayMs(res, attempt));
  }

  // Unreachable — the loop always returns or throws — but keeps TS satisfied.
  throw lastError as HubSpotError;
}

/**
 * POST / PATCH JSON to api.hubapi.com with bearer auth (the write path —
 * outbound sync to a connected HubSpot). Same auth + error contract as
 * hubspotGet; the token is never serialized into errors.
 *
 * Callers should only reach this when a HubSpot connection is enabled (see
 * lib/hubspot/connection.ts) — standalone orgs never hit the network.
 */
async function hubspotSend<T>(method: "POST" | "PATCH", path: string, body: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HubSpotError(res.status, text, path);
  }
  return (await res.json()) as T;
}

export const hubspotPost = <T = unknown>(path: string, body: unknown): Promise<T> =>
  hubspotSend<T>("POST", path, body);
export const hubspotPatch = <T = unknown>(path: string, body: unknown): Promise<T> =>
  hubspotSend<T>("PATCH", path, body);

/**
 * POST to a `/search` endpoint — this is a *read*, not the outbound-write
 * path above (HubSpot puts search behind POST because filters go in the
 * body). Same retry-on-429/5xx contract as hubspotGet, so a transient hiccup
 * fetching a step's total doesn't take down the whole sync.
 */
export async function hubspotSearch<T = unknown>(path: string, body: unknown): Promise<T> {
  const token = getToken();
  let lastError: HubSpotError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (res.ok) return (await res.json()) as T;

    const text = await res.text().catch(() => "");
    lastError = new HubSpotError(res.status, text, path);

    if (!isRetryable(res.status) || attempt === MAX_RETRIES) throw lastError;
    await sleep(retryDelayMs(res, attempt));
  }

  throw lastError as HubSpotError;
}
