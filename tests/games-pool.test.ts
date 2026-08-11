import { describe, expect, test } from "vitest";
import {
  isCatchAllTitle,
  eligibilityIssues,
  draftRevealLine,
  REVEAL_LINE_MAX,
  type PoolCandidate,
} from "../lib/games/pool";

const clean: PoolCandidate = {
  soc_code: "29-2055",
  title: "Surgical Technologists",
  description:
    "Assist in operations, under the supervision of surgeons, registered nurses, or other surgical personnel. May help set up operating room.",
  pay_median: 60610,
};

describe("isCatchAllTitle", () => {
  test("flags SOC 'All Other' buckets", () => {
    expect(isCatchAllTitle("Managers, All Other")).toBe(true);
    expect(isCatchAllTitle("Healthcare Practitioners and Technical Workers, All Other")).toBe(true);
    expect(isCatchAllTitle("managers, all other")).toBe(true);
  });

  test("flags 'Miscellaneous' buckets", () => {
    expect(isCatchAllTitle("Miscellaneous Assemblers and Fabricators")).toBe(true);
  });

  test("passes real titles, including ones containing 'other' innocently", () => {
    expect(isCatchAllTitle("Surgical Technologists")).toBe(false);
    expect(isCatchAllTitle("Occupational Therapists")).toBe(false);
    // "All Other" mid-title is not the catch-all suffix pattern
    expect(isCatchAllTitle("Directors of All Other Programs")).toBe(false);
  });
});

describe("eligibilityIssues", () => {
  test("clean candidate has no issues", () => {
    expect(eligibilityIssues(clean)).toEqual([]);
  });

  test("null or zero pay median blocks", () => {
    expect(eligibilityIssues({ ...clean, pay_median: null })).toContain("no pay data");
    expect(eligibilityIssues({ ...clean, pay_median: 0 })).toContain("no pay data");
  });

  test("catch-all title blocks", () => {
    expect(eligibilityIssues({ ...clean, title: "Managers, All Other" })).toContain(
      "SOC catch-all bucket"
    );
  });

  test("missing or thin description blocks", () => {
    expect(eligibilityIssues({ ...clean, description: null })).toContain("no usable description");
    expect(eligibilityIssues({ ...clean, description: "Does things." })).toContain(
      "no usable description"
    );
  });

  test("issues accumulate", () => {
    const bad = eligibilityIssues({
      soc_code: "11-9199",
      title: "Managers, All Other",
      description: null,
      pay_median: null,
    });
    expect(bad).toHaveLength(3);
  });
});

describe("draftRevealLine", () => {
  test("takes the first sentence without its final period", () => {
    expect(draftRevealLine(clean.description)).toBe(
      "Assist in operations, under the supervision of surgeons, registered nurses, or other surgical personnel"
    );
  });

  test("empty input drafts nothing", () => {
    expect(draftRevealLine(null)).toBe("");
    expect(draftRevealLine("   ")).toBe("");
  });

  test("clips a run-on first sentence at a word boundary", () => {
    const long = "Design, develop, and test " + "very ".repeat(40) + "long systems.";
    const draft = draftRevealLine(long);
    expect(draft.length).toBeLessThanOrEqual(REVEAL_LINE_MAX + 1); // +1 for the ellipsis
    expect(draft.endsWith("…")).toBe(true);
    expect(draft).not.toMatch(/\s…$/);
  });

  test("abbreviation-free single sentences come back whole", () => {
    expect(draftRevealLine("Fix aircraft engines!")).toBe("Fix aircraft engines");
  });
});
