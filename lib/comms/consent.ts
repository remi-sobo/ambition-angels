/**
 * Consent state — the rule that decides whether a story can ever be used.
 *
 * Pure, no server imports, so the API routes, the Phase 2 bank UI, the Phase 3
 * composer, and the tests all answer the question the same way. State is
 * ALWAYS computed from the dates, never stored: a stored flag is wrong the
 * morning after an expiry passes, and this module is the thing standing
 * between a lapsed release and a newsletter that already went out.
 *
 * DRIFT GUARD: v_publishable_stories (Phase 2, migration 2) re-implements the
 * publishable half of this in SQL, because the composer and edition pickers
 * must read a view that RLS can enforce — an app-side check is not a boundary.
 * The two must agree. tests/comms-consent.ts pins the rules here; change one,
 * change both.
 */

/** What a consent row permits. Vocabulary is mirrored by the
 *  story_consents_scope_vocab check constraint — extend both together. */
export const CONSENT_SCOPES = [
  "first_name",
  "full_name",
  "photo",
  "video",
  "quote",
  "outcome_details",
] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const isConsentScope = (v: unknown): v is ConsentScope =>
  typeof v === "string" && (CONSENT_SCOPES as readonly string[]).includes(v);

/** Days before expiry that a current consent starts asking to be renewed. */
export const CONSENT_EXPIRING_DAYS = 30;

/**
 * `pending`  — asked, not yet granted. Does NOT publish. The real workflow:
 *              the draft and photo went to the guardian; we're waiting.
 * `current`  — granted, not revoked, not expired. Publishes.
 * `expiring` — current, but inside the renewal window. Still publishes; the UI
 *              nags.
 * `expired`  — the sunset passed. Blocks.
 * `revoked`  — withdrawn. Blocks, and dominates every other row on the subject.
 * `none`     — no consent rows at all.
 */
export type ConsentState =
  | "pending"
  | "current"
  | "expiring"
  | "expired"
  | "revoked"
  | "none";

export type ConsentRow = {
  scope: string[] | null;
  requested_at: string | null;
  granted_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

/** Today as YYYY-MM-DD. Dates in this module are calendar dates, not instants —
 *  a release that expires "2026-12-31" is good through that whole day. */
export const todayISO = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** Whole days from `from` to `to`, both YYYY-MM-DD. Negative when `to` is past. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** One consent row's state. */
export function consentState(row: ConsentRow, today: string = todayISO()): ConsentState {
  if (row.revoked_at) return "revoked";
  if (!row.granted_at) return row.requested_at ? "pending" : "none";
  if (row.expires_at) {
    const left = daysBetween(today, row.expires_at);
    if (left < 0) return "expired";
    if (left <= CONSENT_EXPIRING_DAYS) return "expiring";
  }
  return "current";
}

/**
 * A subject's state across all its consent rows.
 *
 * Revocation dominates. If a guardian withdrew permission, no other row on that
 * subject — including a broader blanket release signed at intake — brings the
 * story back. That is the only honest reading of "revoke takes effect instantly
 * everywhere," and it is the failure mode the spec cares most about.
 *
 * Otherwise the BEST row wins: a subject covered by any live grant is covered.
 */
export function subjectConsentState(
  rows: readonly ConsentRow[],
  today: string = todayISO(),
): ConsentState {
  if (rows.length === 0) return "none";
  const states = rows.map((r) => consentState(r, today));
  if (states.includes("revoked")) return "revoked";
  if (states.includes("current")) return "current";
  if (states.includes("expiring")) return "expiring";
  if (states.includes("pending")) return "pending";
  if (states.includes("expired")) return "expired";
  return "none";
}

/** States under which a subject may appear in a published output. */
export const PUBLISHABLE_STATES: readonly ConsentState[] = ["current", "expiring"];

export const isPublishableState = (s: ConsentState): boolean =>
  PUBLISHABLE_STATES.includes(s);

/** The union of scopes a subject actually holds right now (revoked, expired,
 *  and merely-requested rows contribute nothing). Drives the photo gate and the
 *  redaction boundary's name rules. */
export function grantedScopes(
  rows: readonly ConsentRow[],
  today: string = todayISO(),
): ConsentScope[] {
  if (subjectConsentState(rows, today) === "revoked") return [];
  const out = new Set<ConsentScope>();
  for (const r of rows) {
    if (!isPublishableState(consentState(r, today))) continue;
    for (const s of r.scope ?? []) if (isConsentScope(s)) out.add(s);
  }
  return CONSENT_SCOPES.filter((s) => out.has(s));
}

/** Worst-first, so a story chip can show the one thing standing in the way. */
const SEVERITY: Record<ConsentState, number> = {
  revoked: 0,
  expired: 1,
  none: 2,
  pending: 3,
  expiring: 4,
  current: 5,
};

export type SubjectLike = {
  subject_type: string;
  consents?: readonly ConsentRow[] | null;
};

/**
 * A story's consent verdict.
 *
 * `state` is null when consent simply doesn't apply — a story about the org
 * itself, a partnership announcement, a subject explicitly recorded as `none`.
 * Those publish on human approval alone; they have no one to protect.
 */
export function storyConsentState(
  subjects: readonly SubjectLike[],
  today: string = todayISO(),
): ConsentState | null {
  const identifiable = subjects.filter((s) => s.subject_type !== "none");
  if (identifiable.length === 0) return null;
  let worst: ConsentState = "current";
  for (const s of identifiable) {
    const st = subjectConsentState(s.consents ?? [], today);
    if (SEVERITY[st] < SEVERITY[worst]) worst = st;
  }
  return worst;
}

/**
 * Can this story flow into a composer draft or an edition slot?
 *
 * Two conditions, both required: a human approved it, and every identifiable
 * subject is currently consented. This is the app-side answer for chips and
 * early 403s — the enforceable boundary is v_publishable_stories in Phase 2.
 */
export function isStoryPublishable(
  status: string,
  subjects: readonly SubjectLike[],
  today: string = todayISO(),
): boolean {
  if (status !== "approved" && status !== "used") return false;
  const state = storyConsentState(subjects, today);
  return state === null || isPublishableState(state);
}

/** One-line reason a story is blocked, for the bank's verdict line and the
 *  403 body. Null when nothing is blocking it. */
export function blockedReason(
  status: string,
  subjects: readonly SubjectLike[],
  today: string = todayISO(),
): string | null {
  if (status === "retired") return "This story is retired.";
  if (status !== "approved" && status !== "used") return "Not approved yet.";
  const state = storyConsentState(subjects, today);
  if (state === null || isPublishableState(state)) return null;
  switch (state) {
    case "revoked":
      return "Consent was revoked — this story can't be used again.";
    case "expired":
      return "Consent has expired. Renew it before using this story.";
    case "pending":
      return "Consent was requested but not granted yet.";
    default:
      return "No consent on record for the person in this story.";
  }
}
