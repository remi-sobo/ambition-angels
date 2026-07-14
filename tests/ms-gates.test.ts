import { describe, expect, test } from "vitest";

import { containsTerm, fleschKincaidGrade, runGates, type GateInput } from "../lib/ms/gates";
import { renderClue6, renderClue7, NATIONAL_MEDIAN, fmtUsd } from "../lib/ms/render";
import { FEW_SHOT_CARDS } from "../lib/ms/fewshot";

// The surgical technologist card with real BLS facts — the worked example
// the whole format was built to (specs/ms-career-cards-v1.md card 01).
const SURG_TECH = FEW_SHOT_CARDS[0];
const SURG_TECH_FACTS = {
  payMedian: 62830,
  payP90: 90700,
  payAsOf: "May 2024",
  educationTypical: null,
  jobZone: 3,
};

function surgTechInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    title: "Surgical Technologist",
    titleVariants: ["Surgical Tech", "Scrub Tech", "Operating Room Technician"],
    field: "health",
    dayVignette: SURG_TECH.dayVignette,
    clues: [
      SURG_TECH.clue1,
      SURG_TECH.clue2,
      SURG_TECH.clue3,
      SURG_TECH.clue4,
      SURG_TECH.clue5,
      renderClue6(SURG_TECH_FACTS),
      renderClue7(SURG_TECH_FACTS),
      SURG_TECH.clue8,
    ],
    payMedian: SURG_TECH_FACTS.payMedian,
    ...overrides,
  };
}

describe("containsTerm", () => {
  test("whole-phrase match, case-insensitive", () => {
    expect(containsTerm("A surgical tech's day starts early", "Surgical Tech")).toBe(true);
  });
  test("does not fire inside another word", () => {
    expect(containsTerm("That was part of the plan", "art")).toBe(false);
  });
  test("tolerates flexible whitespace inside the phrase", () => {
    expect(containsTerm("a registered  nurse arrives", "Registered Nurse")).toBe(true);
  });
});

describe("fleschKincaidGrade", () => {
  test("simple text grades lower than complex text", () => {
    const simple = "I get up. I go to work. I count the tools. The number has to match.";
    const complex =
      "Notwithstanding contemporaneous organizational imperatives, the interdisciplinary practitioner systematically orchestrates multifaceted procedural contingencies.";
    expect(fleschKincaidGrade(simple)).toBeLessThan(fleschKincaidGrade(complex));
  });

  test("the worked-example vignette lands in a plausible grade band", () => {
    const grade = fleschKincaidGrade(SURG_TECH.dayVignette);
    expect(grade).toBeGreaterThan(0);
    expect(grade).toBeLessThan(8);
  });
});

describe("runGates on the worked example", () => {
  test("the surgical technologist card passes every gate", () => {
    const result = runGates(surgTechInput());
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.readingGrade).not.toBeNull();
  });

  test("all eight hand-written vignettes stay silent about their own titles", () => {
    for (const card of FEW_SHOT_CARDS) {
      expect(containsTerm(card.dayVignette, card.title)).toBe(false);
      expect(containsTerm(card.clue1, card.title)).toBe(false);
    }
  });
});

describe("runGates rejections", () => {
  test("vignette naming the job fails", () => {
    const result = runGates(
      surgTechInput({ dayVignette: "I am a surgical technologist and I love my job. " + SURG_TECH.dayVignette })
    );
    expect(result.passed).toBe(false);
    expect(result.failures.map((f) => f.gate)).toContain("vignette_names_job");
  });

  test("clue 1 naming the industry fails", () => {
    const result = runGates(surgTechInput({ clues: (() => {
      const clues = surgTechInput().clues.slice();
      clues[0] = "I solve problems in the hospital before they happen.";
      return clues;
    })() }));
    expect(result.failures.map((f) => f.gate)).toContain("clue1_names_industry");
  });

  test("an empty clue fails", () => {
    const clues = surgTechInput().clues.slice();
    clues[3] = "";
    const result = runGates(surgTechInput({ clues }));
    expect(result.failures.map((f) => f.gate)).toContain("clues_present");
  });

  test("a vague clue 8 fails the specificity gate", () => {
    const clues = surgTechInput().clues.slice();
    clues[7] = "It is a cool job.";
    const result = runGates(surgTechInput({ clues }));
    expect(result.failures.map((f) => f.gate)).toContain("clue8_not_specific");
  });

  test("clue 7 that dropped the real median fails the pay-consistency gate", () => {
    const clues = surgTechInput().clues.slice();
    clues[6] = "It pays a lot of money, trust me.";
    const result = runGates(surgTechInput({ clues }));
    expect(result.failures.map((f) => f.gate)).toContain("clue7_pay_mismatch");
  });

  test("a graduate-seminar vignette fails the reading-grade gate", () => {
    const dense = Array(6)
      .fill(
        "Contemporaneous interdisciplinary practitioners systematically orchestrate multifaceted organizational contingencies throughout institutionally heterogeneous environments."
      )
      .join(" ");
    const result = runGates(surgTechInput({ dayVignette: dense }));
    expect(result.failures.map((f) => f.gate)).toContain("vignette_reading_grade");
  });
});

describe("rendered clues", () => {
  test("clue 7 carries median, p90, and the national anchor", () => {
    const clue = renderClue7(SURG_TECH_FACTS);
    expect(clue).toContain(fmtUsd(62830));
    expect(clue).toContain(fmtUsd(90700));
    expect(clue).toContain(fmtUsd(NATIONAL_MEDIAN.value));
  });

  test("clue 7 omits the p90 sentence when p90 is missing", () => {
    const clue = renderClue7({ ...SURG_TECH_FACTS, payP90: null });
    expect(clue).toContain(fmtUsd(62830));
    expect(clue).not.toContain("top ten percent");
  });

  test("clue 6 says the no-degree part out loud for Job Zones 1-3", () => {
    expect(renderClue6(SURG_TECH_FACTS)).toContain("No four-year degree");
    expect(renderClue6({ ...SURG_TECH_FACTS, jobZone: 4 })).not.toContain("No four-year degree");
  });

  test("clue 6 prefers the BLS education text when imported", () => {
    const clue = renderClue6({
      ...SURG_TECH_FACTS,
      educationTypical: "Postsecondary nondegree award",
    });
    expect(clue).toContain("Postsecondary nondegree award");
    expect(clue).toContain("No four-year degree");
  });
});
