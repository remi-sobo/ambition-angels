import { describe, expect, test, vi, beforeEach } from "vitest";

// Terminology reader + label helper (core fence B3). The contract under test:
// label precedence is org_terminology → entity_types.display_name → code
// fallback; nav labels pluralize renamed terms ("Scholar" → "Scholars", the
// runbook step-9 verify) while 'staff' stays a collective noun; and with
// org_terminology empty (AA today) every label equals the code default, so
// nothing visibly changes.

vi.mock("server-only", () => ({}));

const state = {
  overrides: new Map<string, string>(),
  registry: new Map<string, { display_name: string }>(),
};

vi.mock("@/lib/admin/entities", () => ({
  getTerminology: vi.fn(async () => state.overrides),
  getEntityTypes: vi.fn(async () => state.registry),
}));

import {
  resolveTermLabel,
  pluralizeTerm,
  getTermLabel,
  getNavTermLabels,
  getProgramTerms,
} from "@/lib/admin/terminology";

beforeEach(() => {
  state.overrides = new Map();
  state.registry = new Map([
    ["student", { display_name: "Student" }],
    ["cohort", { display_name: "Cohort" }],
  ]);
});

describe("resolveTermLabel precedence", () => {
  const registryNames = new Map([["student", "Student"]]);

  test("org override wins over the registry", () => {
    const overrides = new Map([["student", "Scholar"]]);
    expect(resolveTermLabel("student", "Fallback", overrides, registryNames)).toBe("Scholar");
  });

  test("registry display_name when there is no override", () => {
    expect(resolveTermLabel("student", "Fallback", new Map(), registryNames)).toBe("Student");
  });

  test("code fallback when neither table knows the key", () => {
    expect(resolveTermLabel("staff", "Staff", new Map(), registryNames)).toBe("Staff");
  });

  test("whitespace-only override falls through", () => {
    const overrides = new Map([["student", "   "]]);
    expect(resolveTermLabel("student", "Fallback", overrides, registryNames)).toBe("Student");
  });
});

describe("pluralizeTerm", () => {
  test.each([
    ["Scholar", "Scholars"],
    ["Student", "Students"],
    ["Cohort", "Cohorts"],
    ["Class", "Classes"],
    ["Match", "Matches"],
    ["Family", "Families"],
    ["Journey", "Journeys"], // vowel + y takes a plain s
    ["", ""],
  ])("%s → %s", (input, expected) => {
    expect(pluralizeTerm(input)).toBe(expected);
  });
});

describe("getTermLabel", () => {
  test("override → registry → fallback", async () => {
    expect(await getTermLabel("student", "X")).toBe("Student");
    state.overrides.set("student", "Scholar");
    expect(await getTermLabel("student", "X")).toBe("Scholar");
    expect(await getTermLabel("staff", "Staff")).toBe("Staff");
  });
});

describe("getNavTermLabels", () => {
  test("empty org_terminology renders the code defaults (AA unchanged)", async () => {
    expect(await getNavTermLabels()).toEqual({
      student: "Students",
      cohort: "Cohorts",
      staff: "Staff",
      volunteer: "Volunteers",
      partner: "Schools & Partners",
      board: "Board",
    });
  });

  test("volunteer follows standard precedence: Leader shows Leaders in the nav", async () => {
    state.overrides.set("volunteer", "Leader");
    expect((await getNavTermLabels()).volunteer).toBe("Leaders");
  });

  test("the runbook verify: student → Scholar shows Scholars in the nav", async () => {
    state.overrides.set("student", "Scholar");
    const labels = await getNavTermLabels();
    expect(labels.student).toBe("Scholars");
    expect(labels.cohort).toBe("Cohorts");
  });

  test("staff is never pluralized", async () => {
    state.overrides.set("staff", "Team");
    expect((await getNavTermLabels()).staff).toBe("Team");
  });

  test("partner is override-only: registry display_name never replaces the compound default", async () => {
    // The registry knows 'partner' → 'Partner', but with no org override the
    // nav must keep its code label, not read "Partners".
    state.registry.set("partner", { display_name: "Partner" });
    expect((await getNavTermLabels()).partner).toBe("Schools & Partners");
    state.overrides.set("partner", "School");
    expect((await getNavTermLabels()).partner).toBe("Schools");
  });

  test("board is override-only and never pluralized", async () => {
    expect((await getNavTermLabels()).board).toBe("Board");
    state.overrides.set("board", "Committee");
    expect((await getNavTermLabels()).board).toBe("Committee");
  });
});

describe("getProgramTerms", () => {
  test("empty org_terminology renders the code defaults (AA unchanged)", async () => {
    // session/stage have no entity_types row → code fallback; student/cohort
    // come from the registry; program has a registry row in prod but the test
    // registry omits it, so it falls back to the code default 'Program'.
    expect(await getProgramTerms()).toEqual({
      student: "Student", students: "Students",
      cohort: "Cohort", cohorts: "Cohorts",
      program: "Program", programs: "Programs",
      session: "Session", sessions: "Sessions",
      stage: "Stage", stages: "Stages",
    });
  });

  test("a seeded tenant renames the whole program vocabulary", async () => {
    state.overrides.set("student", "Student leader");
    state.overrides.set("cohort", "Chapter");
    state.overrides.set("program", "Initiative");
    const t = await getProgramTerms();
    expect(t.students).toBe("Student leaders");
    expect(t.cohort).toBe("Chapter");
    expect(t.cohorts).toBe("Chapters");
    expect(t.programs).toBe("Initiatives");
    // an un-overridden key still shows its default
    expect(t.sessions).toBe("Sessions");
  });
});
