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
    super(`HubSpot ${status} on ${path}: ${bodyPreview.slice(0, 200)}`);
    this.name = "HubSpotError";
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
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
 * Throws HubSpotError on non-2xx. Body preview is included for debugging
 * but the token is never serialized.
 */
export async function hubspotGet<T = unknown>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // No caching at the platform layer; we own caching via hs_* tables.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HubSpotError(res.status, body, path);
  }

  return (await res.json()) as T;
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
