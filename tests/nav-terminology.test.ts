import { describe, expect, test, vi } from "vitest";

// terminology.ts is a server module (its async wrappers read Supabase); the
// pure functions under test need neither.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/entities", () => ({
  getEntityTypes: async () => new Map(),
  getTerminology: async () => new Map(),
}));
import { pluralizeTerm, resolveTermLabel, shellTermLabels } from "@/lib/admin/terminology";
import { V2_DESTINATIONS, resolveV2Destination } from "@/lib/admin/nav";
import { resolveShellNav } from "@/lib/admin/v2shellNav";

// Spec B, stage B4 — tenant terminology on nav labels. Fixtures are the four
// live orgs' org_terminology rows and the live entity_types display names
// (both read from production 2026-09-08), so the fallback chain is exercised
// against real data, not assumed (spec failure mode: "Terminology missing
// for an org — AA has zero org_terminology rows by design").

// entity_types.display_name — the registry defaults (only term-relevant keys;
// there is deliberately NO staff or board registry row).
const REGISTRY = new Map([
  ["student", "Student"],
  ["cohort", "Cohort"],
  ["partner", "Partner"],
  ["volunteer", "Volunteer"],
]);

// org_terminology per org, verbatim from production.
const AA_TERMS = new Map<string, string>(); // zero rows, by design
const YGB_TERMS = new Map([
  ["cohort", "Crew"],
  ["partner", "Community Partner"],
  ["staff", "Team"],
  ["student", "Scholar"],
  ["volunteer", "Mentor"],
]);
const YLEPA_TERMS = new Map([
  ["board", "Committee"],
  ["board_meeting", "Committee meeting"],
  ["cohort", "Group"],
  ["partner", "School"],
  ["student", "Kid"],
  ["volunteer", "Leader"],
]);
const SAFESPACE_TERMS = new Map([
  ["partner", "Community Partner"],
  ["student", "Youth"],
]);

const labels = (terms: Map<string, string>) => shellTermLabels(terms, REGISTRY);

describe("shellTermLabels: the V2 term map", () => {
  test("DoD 2: the Programs tab reads Groups / Crews / Cohorts from the same code path", () => {
    expect(labels(YLEPA_TERMS).cohort).toBe("Groups");
    expect(labels(YGB_TERMS).cohort).toBe("Crews");
    expect(labels(AA_TERMS).cohort).toBe("Cohorts");
    expect(labels(SAFESPACE_TERMS).cohort).toBe("Cohorts"); // no override → registry
  });

  test("AA (zero rows) falls through the whole chain to registry/code defaults", () => {
    expect(labels(AA_TERMS)).toEqual({
      cohort: "Cohorts",
      partner: "Partners",
      student: "People",
      staff: "Team",
      board: "Board",
    });
  });

  test("an org's own rename always wins, pluralized where the tab reads plural", () => {
    const ylepa = labels(YLEPA_TERMS);
    expect(ylepa.partner).toBe("Schools");
    expect(ylepa.student).toBe("Kids");
    expect(ylepa.board).toBe("Committee"); // collective — never pluralized
    const ygb = labels(YGB_TERMS);
    expect(ygb.student).toBe("Scholars");
    expect(ygb.partner).toBe("Community Partners");
    expect(ygb.staff).toBe("Team"); // their own rename happens to equal the V2 default
    expect(labels(SAFESPACE_TERMS).student).toBe("Youths");
  });

  test("V2 renames are NEVER clobbered by generic registry nouns (override-only keys)", () => {
    // The registry says student→"Student"; People must stay People for an
    // org with no rename of its own. Same shape for staff/board (which have
    // no registry row at all — the code default is the last resort).
    const aa = labels(AA_TERMS);
    expect(aa.student).not.toBe("Students");
    expect(aa.student).toBe("People");
    expect(aa.staff).toBe("Team");
  });

  test("cohort/partner ride the full chain because their V2 labels ARE the generic nouns", () => {
    // override → registry → code fallback, in that order.
    expect(resolveTermLabel("cohort", "Cohort", YLEPA_TERMS, REGISTRY)).toBe("Group");
    expect(resolveTermLabel("cohort", "Cohort", AA_TERMS, REGISTRY)).toBe("Cohort");
    expect(resolveTermLabel("cohort", "Cohort", AA_TERMS, new Map())).toBe("Cohort");
  });

  test("pluralizer handles the vocabulary the four orgs actually use", () => {
    for (const [one, many] of [
      ["Group", "Groups"], ["Crew", "Crews"], ["Kid", "Kids"], ["Scholar", "Scholars"],
      ["Youth", "Youths"], ["School", "Schools"], ["Community Partner", "Community Partners"],
      ["Class", "Classes"], ["Family", "Families"],
    ] as const) {
      expect(pluralizeTerm(one)).toBe(many);
    }
  });
});

describe("the labels reach the rendered nav (model + shell)", () => {
  const NINE_KEY = [
    "modules.board", "modules.compliance", "modules.documents",
    "modules.finance", "modules.fundraising", "modules.metrics", "modules.ops",
    "modules.partners", "modules.program",
  ];
  const programs = V2_DESTINATIONS.find((d) => d.key === "programs")!;

  test("model level: Programs tabs read the tenant's words", () => {
    const tabs = resolveV2Destination(programs, NINE_KEY, labels(YLEPA_TERMS))!.tabs;
    const byKey = Object.fromEntries(tabs.map((t) => [t.key, t.label]));
    expect(byKey.cohorts).toBe("Groups");
    expect(byKey.partners).toBe("Schools");
    expect(byKey.people).toBe("Kids");
  });

  test("shell level: the same words survive live-seat resolution", () => {
    const nav = resolveShellNav(NINE_KEY, labels(YLEPA_TERMS));
    const prog = nav.destinations.find((d) => d.key === "programs")!;
    const byKey = Object.fromEntries(prog.tabs.map((t) => [t.key, t.label]));
    expect(byKey.cohorts).toBe("Groups");
    expect(byKey.people).toBe("Kids");
    const org = nav.destinations.find((d) => d.key === "organization")!;
    expect(org.tabs.find((t) => t.key === "board")!.label).toBe("Committee");
  });

  test("no terms at all (pre-auth) leaves every code label intact", () => {
    const tabs = resolveV2Destination(programs, null, null)!.tabs;
    expect(tabs.map((t) => t.label)).toContain("People");
    expect(tabs.map((t) => t.label)).toContain("Cohorts");
    expect(tabs.map((t) => t.label)).toContain("Partners");
  });
});
