// Manual journey enrollment decisions (specs/donor-lifecycle-journeys.md
// Phase 3, Amendment 1 §B). Pure and deterministic — time is injected — so
// every guard branch is unit-testable; the API route just executes whatever
// decision comes back.
//
// The insert row MUST stay identical in shape to what the cron enroller's
// tryEnroll upsert writes (app/api/cron/journeys/route.ts): same columns,
// current_step 0, next_run_at = now + step-0 delay, status 'active', org_id
// explicit. That contract is what lets the hourly cron advance manual
// enrollees with zero changes to the send path.
//
// Duplicate handling (Amendment 1 §B.2): the DB enforces
// unique (journey_id, constituent_id) with no status qualifier, so
// re-enrollment MUTATES the existing cancelled/completed row back to a fresh
// active state rather than inserting around the constraint.

export type EnrollRefusal = "do_not_contact" | "no_email" | "no_steps" | "already_active";

export const REFUSAL_MESSAGE: Record<EnrollRefusal, string> = {
  do_not_contact: "This donor is marked do-not-contact, so they can't be enrolled in a journey.",
  no_email: "This donor has no email on file — journeys send email, so enrollment is refused.",
  no_steps: "This journey has no steps yet — add at least one step before enrolling anyone.",
  already_active: "Already enrolled — this donor has an active enrollment in this journey.",
};

/** The exact row the cron's tryEnroll writes; keep the two in lockstep. */
export type EnrollmentInsert = {
  org_id: string;
  journey_id: string;
  constituent_id: string;
  status: "active";
  current_step: 0;
  next_run_at: string;
};

export type EnrollDecision =
  | { kind: "refuse"; reason: EnrollRefusal; message: string }
  | {
      kind: "reset";
      enrollmentId: string;
      patch: { status: "active"; current_step: 0; next_run_at: string; last_step_at: null };
    }
  | { kind: "insert"; row: EnrollmentInsert };

/** Same semantics as the cron's plusDaysIso, anchored to an injected now. */
export const nextRunAtIso = (nowMs: number, delayDays: number): string =>
  new Date(nowMs + delayDays * 86_400_000).toISOString();

export function decideEnrollment({
  orgId,
  journeyId,
  constituentId,
  constituent,
  steps,
  existing,
  nowMs,
}: {
  orgId: string;
  journeyId: string;
  constituentId: string;
  constituent: { emails: string[] | null; do_not_contact: boolean };
  /** The journey's steps in step_order (only the first delay is used). */
  steps: Array<{ delay_days: number }>;
  /** Any existing enrollment for (journey, constituent), regardless of status. */
  existing: { id: string; status: string } | null;
  nowMs: number;
}): EnrollDecision {
  const refuse = (reason: EnrollRefusal): EnrollDecision => ({
    kind: "refuse",
    reason,
    message: REFUSAL_MESSAGE[reason],
  });

  // Guard order per Amendment 1 §B.1: do-not-contact, then the email guard
  // (mirrors the cron's tryEnroll precondition — without it a manual
  // enrollment dies silently at the next cron run), then duplicates.
  if (constituent.do_not_contact) return refuse("do_not_contact");
  if (!((constituent.emails ?? [])[0])) return refuse("no_email");
  if (steps.length === 0) return refuse("no_steps");

  const next_run_at = nextRunAtIso(nowMs, steps[0].delay_days);
  if (existing) {
    if (existing.status === "active") return refuse("already_active");
    return {
      kind: "reset",
      enrollmentId: existing.id,
      patch: { status: "active", current_step: 0, next_run_at, last_step_at: null },
    };
  }
  return {
    kind: "insert",
    row: {
      org_id: orgId,
      journey_id: journeyId,
      constituent_id: constituentId,
      status: "active",
      current_step: 0,
      next_run_at,
    },
  };
}
