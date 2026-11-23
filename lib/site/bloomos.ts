import "server-only";
import { randomUUID } from "crypto";
import { getSiteSupabase, isSiteDbConfigured } from "./supabase";

/**
 * The website's client for the BloomOS intake API (specs/bloomos-repo-split.md §6a).
 *
 * INTAKE_MODE decides where a public form goes:
 *   "db"  (default)  the old path: the route writes to the database itself.
 *   "api"            the route calls sendToBloomOS() instead.
 * Rollback is one env change.
 *
 * The promise to the visitor: a form is never lost. Outcomes:
 *   delivered   BloomOS saved it. Logged in intake_outbox as delivered, with
 *               no payload kept.
 *   queued      BloomOS was down, slow, or refused the key. The payload waits
 *               in intake_outbox and the retry cron delivers it. The visitor
 *               still sees success.
 *   rejected    BloomOS said the form itself is invalid (400). Retrying can't
 *               fix that, so the visitor sees the message and can correct it.
 *   failed      BloomOS didn't take it AND the outbox write failed too. The only
 *               case the visitor is asked to try again.
 *
 * Every payload carries a submission_id, so a retry never double-inserts.
 */

export type IntakeKind =
  | "application"
  | "partner_inquiry"
  | "company_contact"
  | "coach_signup"
  | "ygb_registration"
  | "demoday_signup"
  | "quiz_submission"
  | "donation";

export type SendResult =
  | { outcome: "delivered"; body: Record<string, unknown> }
  | { outcome: "queued" }
  | { outcome: "rejected"; status: number; error: string }
  | { outcome: "failed" };

const TIMEOUT_MS = 8000;

export function intakeMode(): "api" | "db" {
  return process.env.INTAKE_MODE === "api" ? "api" : "db";
}

type Deps = {
  fetch: typeof fetch;
  outbox: {
    delivered(row: { submission_id: string; kind: string; bloomos_id: string | null }): Promise<void>;
    queue(row: { submission_id: string; kind: string; payload: Record<string, unknown>; last_error: string }): Promise<void>;
  };
  newId(): string;
};

function realDeps(): Deps {
  return {
    fetch: (...a) => fetch(...a),
    newId: randomUUID,
    outbox: {
      async delivered(row) {
        if (!isSiteDbConfigured()) return;
        await getSiteSupabase()
          .from("intake_outbox")
          .insert({ ...row, status: "delivered", attempts: 1, delivered_at: new Date().toISOString(), last_attempt_at: new Date().toISOString() });
      },
      async queue(row) {
        const { error } = await getSiteSupabase()
          .from("intake_outbox")
          .insert({ ...row, status: "pending", attempts: 1, last_attempt_at: new Date().toISOString() });
        if (error) throw new Error(error.message);
      },
    },
  };
}

/** POST one payload to BloomOS. Exported for the retry cron, which reuses the stored submission_id. */
export async function postToBloomOS(
  kind: IntakeKind,
  payload: Record<string, unknown>,
  f: typeof fetch = fetch,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const base = process.env.BLOOMOS_INTAKE_URL?.replace(/\/+$/, "");
  const key = process.env.BLOOMOS_INTAKE_KEY;
  if (!base || !key) return { ok: false, status: 0, error: "BLOOMOS_INTAKE_URL / BLOOMOS_INTAKE_KEY not set" };
  try {
    const res = await f(`${base}/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, body };
    return { ok: false, status: res.status, error: typeof body.error === "string" ? body.error : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendToBloomOS(
  kind: IntakeKind,
  fields: Record<string, unknown>,
  deps: Deps = realDeps(),
): Promise<SendResult> {
  const submission_id = deps.newId();
  const payload = { ...fields, submission_id };
  const r = await postToBloomOS(kind, payload, deps.fetch);

  if (r.ok) {
    const id = typeof r.body.id === "string" ? r.body.id : null;
    await deps.outbox.delivered({ submission_id, kind, bloomos_id: id }).catch((err) =>
      console.error("[intake] delivered log failed:", err instanceof Error ? err.message : err),
    );
    return { outcome: "delivered", body: r.body };
  }

  // The form itself is invalid. Retrying can't fix it; show the visitor why.
  if (r.status === 400) return { outcome: "rejected", status: 400, error: r.error };

  // Anything else (down, timeout, 5xx, 409, or a key/config problem) waits in the outbox.
  console.error(`[intake] ${kind} not delivered (${r.status || "network"}): ${r.error}. Queuing.`);
  try {
    await deps.outbox.queue({ submission_id, kind, payload, last_error: `${r.status || "network"}: ${r.error}`.slice(0, 500) });
    return { outcome: "queued" };
  } catch (err) {
    console.error("[intake] OUTBOX WRITE FAILED, form not saved anywhere:", err instanceof Error ? err.message : err);
    return { outcome: "failed" };
  }
}

/**
 * Open cohorts for the /apply picker, from BloomOS. Null when BloomOS can't
 * be reached: the page then shows no program choices and the application
 * files as general interest, which staff can reassign.
 */
export async function fetchOpenCohorts(f: typeof fetch = fetch): Promise<{ id: string; name: string }[] | null> {
  const base = process.env.BLOOMOS_INTAKE_URL?.replace(/\/+$/, "");
  const key = process.env.BLOOMOS_INTAKE_KEY;
  if (!base || !key) return null;
  try {
    const res = await f(`${base}/options/application`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { cohorts?: { id: string; name: string }[] };
    return Array.isArray(body.cohorts) ? body.cohorts : null;
  } catch {
    return null;
  }
}
