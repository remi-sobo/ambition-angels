import { hashApiKey, parseBearer } from "./keys";
import type { IntakeCtx, IntakeOrg, IntakeResult, KindHandler } from "./types";

/**
 * The intake request pipeline, free of Next and Supabase so the gates can be
 * tested directly. Order:
 *
 *   1. key        missing, malformed, unknown, or revoked → 401
 *   2. kind       unknown → 404
 *   3. scope      key lacks the kind's scope → 403
 *   4. entitled   org lacks the kind's entitlement (aa.* for AA-only kinds) → 403
 *   5. payload    not an object, no uuid submission_id, or fails validation → 400
 *   6. dedupe     (org, submission_id) already done → 200 with the stored response;
 *                 still processing → 409 so the sender retries later
 *   7. run        handler throws → 500, claim released so a retry can succeed
 *
 * The org comes from the key and nothing else. A payload field called org_id
 * (or anything like it) is never read.
 */

export type ApiKeyRow = {
  id: string;
  org_id: string;
  scopes: string[];
  revoked_at: string | null;
};

export type ClaimResult =
  | { claimed: true }
  | { claimed: false; status: "processing" | "done"; response: IntakeResult | null };

export type IntakeDeps = {
  findKeyByHash(hash: string): Promise<ApiKeyRow | null>;
  touchKey(id: string): Promise<void>;
  loadOrg(orgId: string): Promise<IntakeOrg | null>;
  loadEntitlements(orgId: string): Promise<ReadonlySet<string>>;
  claim(args: { orgId: string; keyId: string; kind: string; submissionId: string }): Promise<ClaimResult>;
  complete(args: { orgId: string; submissionId: string; response: IntakeResult }): Promise<void>;
  release(args: { orgId: string; submissionId: string }): Promise<void>;
  ctxFor(org: IntakeOrg): IntakeCtx;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlers: Record<string, KindHandler<any>>;
};

export type IntakeOutcome = { status: number; body: Record<string, unknown> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Authenticated =
  | { ok: true; key: ApiKeyRow; org: IntakeOrg }
  | { ok: false; outcome: IntakeOutcome };

/** Steps 1: resolve the key to a live key row and its org. */
export async function authenticate(
  deps: Pick<IntakeDeps, "findKeyByHash" | "touchKey" | "loadOrg">,
  authorization: string | null,
): Promise<Authenticated> {
  const raw = parseBearer(authorization);
  const unauthorized: Authenticated = {
    ok: false,
    outcome: { status: 401, body: { error: "Invalid or missing API key." } },
  };
  if (!raw) return unauthorized;
  const key = await deps.findKeyByHash(hashApiKey(raw));
  if (!key || key.revoked_at) return unauthorized;
  const org = await deps.loadOrg(key.org_id);
  if (!org) return unauthorized;
  // Best effort. A failed timestamp write never fails the call.
  await deps.touchKey(key.id).catch(() => undefined);
  return { ok: true, key, org };
}

export async function runIntake(
  deps: IntakeDeps,
  req: { kind: string; authorization: string | null; body: unknown },
): Promise<IntakeOutcome> {
  const auth = await authenticate(deps, req.authorization);
  if (!auth.ok) return auth.outcome;
  const { key, org } = auth;

  const handler = Object.prototype.hasOwnProperty.call(deps.handlers, req.kind)
    ? deps.handlers[req.kind]
    : undefined;
  if (!handler) return { status: 404, body: { error: `Unknown intake kind "${req.kind}".` } };

  if (!key.scopes.includes(handler.scope)) {
    return { status: 403, body: { error: `This key lacks the ${handler.scope} scope.` } };
  }
  if (handler.entitlement) {
    const ents = await deps.loadEntitlements(org.id);
    if (!ents.has(handler.entitlement)) {
      return { status: 403, body: { error: `This org can't accept ${req.kind} submissions.` } };
    }
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return { status: 400, body: { error: "Invalid request." } };
  }
  const body = req.body as Record<string, unknown>;
  const submissionId = typeof body.submission_id === "string" ? body.submission_id : "";
  if (!UUID_RE.test(submissionId)) {
    return { status: 400, body: { error: "submission_id must be a uuid." } };
  }

  const v = handler.validate(body);
  if (!v.ok) return { status: 400, body: { error: v.error } };

  const claim = await deps.claim({ orgId: org.id, keyId: key.id, kind: req.kind, submissionId });
  if (!claim.claimed) {
    if (claim.status === "done") {
      return { status: 200, body: { ...(claim.response ?? { ok: true }), duplicate: true } };
    }
    return { status: 409, body: { error: "This submission is still being processed. Retry shortly." } };
  }

  let result: IntakeResult;
  try {
    result = await handler.run(deps.ctxFor(org), v.data);
  } catch (err) {
    console.error(`[intake] ${req.kind} failed for org ${org.slug}:`, err instanceof Error ? err.message : err);
    await deps.release({ orgId: org.id, submissionId }).catch(() => undefined);
    return { status: 500, body: { error: "Failed to save. Please retry." } };
  }

  const response = { ok: true, ...result };
  await deps.complete({ orgId: org.id, submissionId, response }).catch((err) =>
    console.error("[intake] could not mark submission done:", err),
  );
  return { status: 200, body: response };
}
