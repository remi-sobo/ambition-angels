import { describe, expect, test } from "vitest";
import {
  decideEnrollment,
  nextRunAtIso,
  REFUSAL_MESSAGE,
  type EnrollDecision,
} from "../lib/fundraising/enroll";

const NOW = Date.parse("2026-07-21T12:00:00.000Z");

// A decision input with sensible defaults; override per case.
const input = (p: Partial<Parameters<typeof decideEnrollment>[0]>) => ({
  orgId: "org-1",
  journeyId: "journey-1",
  constituentId: "donor-1",
  constituent: { emails: ["donor@example.org"], do_not_contact: false },
  steps: [{ delay_days: 2 }],
  existing: null,
  nowMs: NOW,
  ...p,
});

const refusalOf = (d: EnrollDecision) => (d.kind === "refuse" ? d.reason : null);

describe("decideEnrollment guards (Amendment 1 §B.1, in order)", () => {
  test("do_not_contact refused with its own message", () => {
    const d = decideEnrollment(input({ constituent: { emails: ["a@b.c"], do_not_contact: true } }));
    expect(d).toEqual({ kind: "refuse", reason: "do_not_contact", message: REFUSAL_MESSAGE.do_not_contact });
  });

  test("no email on file refused (null, empty list, and empty-string cases)", () => {
    for (const emails of [null, [], [""]]) {
      const d = decideEnrollment(input({ constituent: { emails, do_not_contact: false } }));
      expect(refusalOf(d)).toBe("no_email");
      expect(d.kind === "refuse" && d.message).toBe(REFUSAL_MESSAGE.no_email);
    }
  });

  test("journey with no steps refused", () => {
    expect(refusalOf(decideEnrollment(input({ steps: [] })))).toBe("no_steps");
  });

  test("existing active enrollment refused as already enrolled", () => {
    const d = decideEnrollment(input({ existing: { id: "e-1", status: "active" } }));
    expect(d).toEqual({ kind: "refuse", reason: "already_active", message: REFUSAL_MESSAGE.already_active });
  });

  test("guard order: do_not_contact wins over no-email and duplicate", () => {
    const d = decideEnrollment(
      input({
        constituent: { emails: null, do_not_contact: true },
        existing: { id: "e-1", status: "active" },
      })
    );
    expect(refusalOf(d)).toBe("do_not_contact");
  });

  test("guard order: no-email wins over duplicate", () => {
    const d = decideEnrollment(input({ constituent: { emails: [], do_not_contact: false }, existing: { id: "e-1", status: "active" } }));
    expect(refusalOf(d)).toBe("no_email");
  });
});

describe("reset vs insert fork (Amendment 1 §B.2)", () => {
  test("cancelled enrollment → reset that row to a fresh active state", () => {
    const d = decideEnrollment(input({ existing: { id: "e-9", status: "cancelled" } }));
    expect(d).toEqual({
      kind: "reset",
      enrollmentId: "e-9",
      patch: { status: "active", current_step: 0, next_run_at: nextRunAtIso(NOW, 2), last_step_at: null },
    });
  });

  test("completed enrollment → reset, same as cancelled", () => {
    const d = decideEnrollment(input({ existing: { id: "e-9", status: "completed" } }));
    expect(d.kind).toBe("reset");
    expect(d.kind === "reset" && d.patch.current_step).toBe(0);
    expect(d.kind === "reset" && d.patch.last_step_at).toBeNull();
  });

  test("no existing row → insert", () => {
    expect(decideEnrollment(input({})).kind).toBe("insert");
  });
});

describe("insert row shape matches the cron enroller's tryEnroll upsert", () => {
  // The cron (app/api/cron/journeys/route.ts) writes exactly:
  //   { org_id, journey_id, constituent_id, current_step: 0,
  //     next_run_at: plusDaysIso(step0Delay), status: "active" }
  // last_step_at is omitted (null default) and enrolled_at defaults to now().
  // If this test breaks, one of the two writers changed shape — fix the drift,
  // not the test.
  test("identical columns, identical semantics", () => {
    const d = decideEnrollment(input({}));
    if (d.kind !== "insert") throw new Error("expected insert");
    expect(Object.keys(d.row).sort()).toEqual(
      ["constituent_id", "current_step", "journey_id", "next_run_at", "org_id", "status"].sort()
    );
    expect(d.row).toEqual({
      org_id: "org-1",
      journey_id: "journey-1",
      constituent_id: "donor-1",
      status: "active",
      current_step: 0,
      next_run_at: nextRunAtIso(NOW, 2),
    });
  });

  test("next_run_at honors the first step's delay (0 days → due now)", () => {
    const d = decideEnrollment(input({ steps: [{ delay_days: 0 }] }));
    expect(d.kind === "insert" && d.row.next_run_at).toBe(new Date(NOW).toISOString());
  });

  test("next_run_at for a 3-day delay lands exactly 3 days out", () => {
    const d = decideEnrollment(input({ steps: [{ delay_days: 3 }] }));
    expect(d.kind === "insert" && d.row.next_run_at).toBe(new Date(NOW + 3 * 86_400_000).toISOString());
  });
});
