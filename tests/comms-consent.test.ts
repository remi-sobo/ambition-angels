import { describe, expect, test } from "vitest";

import {
  blockedReason,
  consentState,
  daysBetween,
  grantedScopes,
  isStoryPublishable,
  storyConsentState,
  subjectConsentState,
  type ConsentRow,
} from "../lib/comms/consent";
import { normalizeTags, redactedSubjectLabel, viewSubject } from "../lib/comms/stories";

/**
 * The consent rules are the module's whole compliance claim: a story without
 * current permission physically cannot reach a draft or a send. These pin the
 * behavior the Phase 2 view (v_publishable_stories) has to match in SQL.
 */

const TODAY = "2026-08-19";

const row = (over: Partial<ConsentRow> = {}): ConsentRow => ({
  scope: ["first_name"],
  requested_at: null,
  granted_at: null,
  expires_at: null,
  revoked_at: null,
  ...over,
});

describe("daysBetween", () => {
  test("counts forward and backward across a month boundary", () => {
    expect(daysBetween("2026-08-19", "2026-09-18")).toBe(30);
    expect(daysBetween("2026-08-19", "2026-08-19")).toBe(0);
    expect(daysBetween("2026-08-19", "2026-08-18")).toBe(-1);
  });
});

describe("consentState — one row", () => {
  test("asked but not granted is pending, and pending is not permission", () => {
    expect(consentState(row({ requested_at: "2026-08-10" }), TODAY)).toBe("pending");
  });

  test("granted with no sunset stays current", () => {
    expect(consentState(row({ granted_at: "2020-01-01" }), TODAY)).toBe("current");
  });

  test("a sunset more than 30 days out is current", () => {
    expect(consentState(row({ granted_at: "2026-01-01", expires_at: "2026-12-31" }), TODAY)).toBe(
      "current",
    );
  });

  test("inside the renewal window it is expiring — still usable, but nagging", () => {
    expect(consentState(row({ granted_at: "2026-01-01", expires_at: "2026-09-01" }), TODAY)).toBe(
      "expiring",
    );
    // The boundary itself: exactly 30 days out is still "expiring", not current.
    expect(consentState(row({ granted_at: "2026-01-01", expires_at: "2026-09-18" }), TODAY)).toBe(
      "expiring",
    );
  });

  test("the last day of a consent still counts; the day after does not", () => {
    expect(consentState(row({ granted_at: "2026-01-01", expires_at: TODAY }), TODAY)).toBe(
      "expiring",
    );
    expect(consentState(row({ granted_at: "2026-01-01", expires_at: "2026-08-18" }), TODAY)).toBe(
      "expired",
    );
  });

  test("revocation beats a live grant", () => {
    expect(
      consentState(
        row({ granted_at: "2026-01-01", expires_at: "2030-01-01", revoked_at: "2026-08-18T10:00:00Z" }),
        TODAY,
      ),
    ).toBe("revoked");
  });
});

describe("subjectConsentState — many rows on one person", () => {
  test("no rows at all is none", () => {
    expect(subjectConsentState([], TODAY)).toBe("none");
  });

  test("any live grant covers the subject", () => {
    const rows = [row({ requested_at: "2026-08-01" }), row({ granted_at: "2026-08-01" })];
    expect(subjectConsentState(rows, TODAY)).toBe("current");
  });

  test("an expired release plus a fresh one is current", () => {
    const rows = [
      row({ granted_at: "2024-01-01", expires_at: "2025-01-01" }),
      row({ granted_at: "2026-08-01" }),
    ];
    expect(subjectConsentState(rows, TODAY)).toBe("current");
  });

  test("REVOCATION DOMINATES — a blanket intake release does not resurrect it", () => {
    const rows = [
      // The photo/video form signed at enrollment: broad, unexpired.
      row({ scope: ["first_name", "photo", "quote"], granted_at: "2026-01-01" }),
      // The guardian later withdrew permission for this story.
      row({ scope: ["photo"], granted_at: "2026-06-01", revoked_at: "2026-08-01T00:00:00Z" }),
    ];
    expect(subjectConsentState(rows, TODAY)).toBe("revoked");
    expect(grantedScopes(rows, TODAY)).toEqual([]);
  });

  test("pending outranks expired — asked-and-waiting is better news than lapsed", () => {
    const rows = [
      row({ granted_at: "2024-01-01", expires_at: "2025-01-01" }),
      row({ requested_at: "2026-08-15" }),
    ];
    expect(subjectConsentState(rows, TODAY)).toBe("pending");
  });
});

describe("grantedScopes — what may actually be said", () => {
  test("only live grants contribute, and the order is the vocabulary's", () => {
    const rows = [
      row({ scope: ["photo", "first_name"], granted_at: "2026-08-01" }),
      row({ scope: ["quote"], requested_at: "2026-08-10" }), // pending: contributes nothing
      row({ scope: ["full_name"], granted_at: "2024-01-01", expires_at: "2025-01-01" }), // expired
    ];
    expect(grantedScopes(rows, TODAY)).toEqual(["first_name", "photo"]);
  });

  test("unknown scope strings are dropped, not trusted", () => {
    const rows = [row({ scope: ["photo", "home_address"], granted_at: "2026-08-01" })];
    expect(grantedScopes(rows, TODAY)).toEqual(["photo"]);
  });
});

describe("storyConsentState — the worst subject wins", () => {
  const consented = { subject_type: "participant", consents: [row({ granted_at: "2026-08-01" })] };
  const lapsed = {
    subject_type: "participant",
    consents: [row({ granted_at: "2024-01-01", expires_at: "2025-01-01" })],
  };

  test("a story about nobody has no consent question to answer", () => {
    expect(storyConsentState([], TODAY)).toBeNull();
    expect(storyConsentState([{ subject_type: "none", consents: [] }], TODAY)).toBeNull();
  });

  test("one lapsed subject blocks a story its other subject would allow", () => {
    expect(storyConsentState([consented, lapsed], TODAY)).toBe("expired");
  });

  test("a subject with no consent rows at all blocks the story", () => {
    expect(storyConsentState([{ subject_type: "participant", consents: [] }], TODAY)).toBe("none");
  });
});

describe("storyConsentState with a redacted subject — the regression", () => {
  // A subject a staff user may not identify arrives with NO consent rows: the
  // guardian's name and dates are exactly what comms.subjects.read withholds.
  // It carries its computed state instead. Deriving the story verdict from the
  // rows alone made every participant story read "no consent" for the people
  // who capture them, and blocked stories that were perfectly consented.
  const redacted = {
    subject_type: "participant",
    consent_state: "current" as const,
    // consents deliberately absent, exactly as viewSubject() returns it
  };

  test("a redacted subject's own state decides the story's verdict", () => {
    expect(storyConsentState([redacted], TODAY)).toBe("current");
    expect(isStoryPublishable("approved", [redacted], TODAY)).toBe(true);
    expect(blockedReason("approved", [redacted], TODAY)).toBeNull();
  });

  test("a redacted subject that really is blocked still blocks", () => {
    const pending = { subject_type: "participant", consent_state: "pending" as const };
    expect(storyConsentState([pending], TODAY)).toBe("pending");
    expect(isStoryPublishable("approved", [pending], TODAY)).toBe(false);
  });

  test("the worst subject still wins across a mix of redacted and visible", () => {
    const visible = { subject_type: "partner", consents: [row({ granted_at: "2026-08-01" })] };
    const lapsed = { subject_type: "participant", consent_state: "expired" as const };
    expect(storyConsentState([redacted, visible, lapsed], TODAY)).toBe("expired");
  });

  test("rows are still used when no pre-computed state is given", () => {
    const fromRows = { subject_type: "participant", consents: [row({ granted_at: "2026-08-01" })] };
    expect(storyConsentState([fromRows], TODAY)).toBe("current");
  });
});

describe("isStoryPublishable — approval AND consent, never one or the other", () => {
  const ok = [{ subject_type: "participant", consents: [row({ granted_at: "2026-08-01" })] }];

  test("a raw story is not publishable however well consented", () => {
    expect(isStoryPublishable("raw", ok, TODAY)).toBe(false);
    expect(isStoryPublishable("drafted", ok, TODAY)).toBe(false);
  });

  test("approved and used both publish", () => {
    expect(isStoryPublishable("approved", ok, TODAY)).toBe(true);
    expect(isStoryPublishable("used", ok, TODAY)).toBe(true);
  });

  test("retired never publishes", () => {
    expect(isStoryPublishable("retired", ok, TODAY)).toBe(false);
  });

  test("an org-level win publishes on approval alone", () => {
    expect(isStoryPublishable("approved", [], TODAY)).toBe(true);
  });

  test("expiring still publishes — the nag is not a block", () => {
    const soon = [
      { subject_type: "participant", consents: [row({ granted_at: "2026-01-01", expires_at: "2026-09-01" })] },
    ];
    expect(isStoryPublishable("approved", soon, TODAY)).toBe(true);
  });

  test("the spec's headline case: a minor with no photo consent cannot be used", () => {
    const blocked = [{ subject_type: "participant", consents: [row({ requested_at: "2026-08-15" })] }];
    expect(isStoryPublishable("approved", blocked, TODAY)).toBe(false);
    expect(blockedReason("approved", blocked, TODAY)).toMatch(/not granted yet/);
  });
});

describe("blockedReason — one sentence a human can act on", () => {
  test("nothing to say when the story is clear", () => {
    expect(
      blockedReason("approved", [{ subject_type: "participant", consents: [row({ granted_at: "2026-08-01" })] }], TODAY),
    ).toBeNull();
  });

  test("revocation is named as permanent, not as a renewal prompt", () => {
    const revoked = [
      { subject_type: "participant", consents: [row({ granted_at: "2026-01-01", revoked_at: "2026-08-01T00:00:00Z" })] },
    ];
    expect(blockedReason("approved", revoked, TODAY)).toMatch(/revoked/i);
    expect(blockedReason("approved", revoked, TODAY)).not.toMatch(/renew/i);
  });

  test("not-yet-approved reads as a workflow step, not a compliance failure", () => {
    expect(blockedReason("raw", [], TODAY)).toBe("Not approved yet.");
  });
});

describe("viewSubject — the redaction the split permission exists for", () => {
  const participant = {
    id: "s1",
    subject_type: "participant",
    subject_id: "student-uuid",
    display_label: "Marcus",
    is_minor: true,
    consents: [row({ granted_at: "2026-08-01" })],
  };

  test("without comms.subjects.read, neither the name nor the record id survives", () => {
    const v = viewSubject(participant, false, TODAY);
    expect(v.display_label).toBe("a young person");
    expect(v.subject_id).toBeNull();
    expect(v.redacted).toBe(true);
    expect(v.consents).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain("Marcus");
    expect(JSON.stringify(v)).not.toContain("student-uuid");
  });

  test("the consent state still comes through, so the blocked chip can explain itself", () => {
    expect(viewSubject(participant, false, TODAY).consent_state).toBe("current");
    const lapsed = { ...participant, consents: [row({ granted_at: "2024-01-01", expires_at: "2025-01-01" })] };
    expect(viewSubject(lapsed, false, TODAY).consent_state).toBe("expired");
  });

  test("an adult participant gets the adult placeholder", () => {
    const adult = { ...participant, is_minor: false };
    expect(viewSubject(adult, false, TODAY).display_label).toBe("a participant");
    expect(redactedSubjectLabel(false)).toBe("a participant");
  });

  test("with the permission, everything comes through", () => {
    const v = viewSubject(participant, true, TODAY);
    expect(v.display_label).toBe("Marcus");
    expect(v.subject_id).toBe("student-uuid");
    expect(v.redacted).toBe(false);
    expect(v.consents).toHaveLength(1);
  });

  test("a partner or donor subject is never redacted — that is not what this protects", () => {
    const partner = {
      id: "s2",
      subject_type: "partner",
      subject_id: "partner-uuid",
      display_label: "Eastside High",
      is_minor: false,
      consents: [],
    };
    const v = viewSubject(partner, false, TODAY);
    expect(v.display_label).toBe("Eastside High");
    expect(v.redacted).toBe(false);
  });
});

describe("normalizeTags", () => {
  test("lowercases, trims, dedupes, and drops non-strings", () => {
    expect(normalizeTags([" Demo Day ", "demo day", "Youth", 7, null])).toEqual([
      "demo day",
      "youth",
    ]);
  });

  test("caps the count so a paste can't become a row", () => {
    expect(normalizeTags(Array.from({ length: 40 }, (_, i) => `t${i}`))).toHaveLength(12);
  });

  test("anything that isn't a list is no tags", () => {
    expect(normalizeTags("demo day")).toEqual([]);
    expect(normalizeTags(undefined)).toEqual([]);
  });
});
