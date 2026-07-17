import { describe, it, expect } from "vitest";
import {
  COACH_PROMPTS,
  COACH_SYSTEM,
  COACH_ATTRIBUTION,
  COACH_LENSES,
  DEFAULT_LENS_ID,
  DEFEND_DRAFT,
  REVIEW_TITLE,
  getCoachPrompt,
  getCoachLens,
  buildCoachUserPrompt,
} from "@/lib/fundraising/grantCoach";

// Reed's Proposal Review (specs/reeds-proposal-review.md): the value is prompt
// fidelity — every run carries the audience lens, the draft and funder
// materials clearly fenced, the safety rules (refine-don't-write, never
// fabricate), and the rigor spine inherited from the original coach (rating
// definitions, specificity penalty, aspirational-claim cap). These tests
// freeze that contract.

const LENS = COACH_LENSES[0];

describe("prompt registry", () => {
  it("has unique ids and complete entries", () => {
    const ids = COACH_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of COACH_PROMPTS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.blurb.length).toBeGreaterThan(0);
      expect(p.instructions.length).toBeGreaterThan(100);
      expect(["feedback", "stress-test"]).toContain(p.group);
    }
  });

  it("includes the assessment as the entry point, with the rigor spine intact", () => {
    const assessment = getCoachPrompt("assessment");
    expect(assessment).not.toBeNull();
    const text = assessment!.instructions;
    expect(text).toContain("Developing / Strong / Standout");
    expect(text).toContain("Where to go deeper");
    // The three rules that keep ratings honest — spec failure mode "rewrite
    // regression".
    expect(text).toContain("mandatory specificity penalty");
    expect(text).toContain("aspirational-claim cap");
    expect(text).toContain("Don't grade on a curve");
    // The audience criterion comes from the lens block, not a fixed list.
    expect(text).toContain("audience criterion named in the AUDIENCE LENS block");
  });

  it("makes the AI criterion conditional, omitted when absent", () => {
    const text = getCoachPrompt("assessment")!.instructions;
    expect(text).toContain('conditional rule for "Responsible AI and technology"');
    expect(text).toContain("omit this criterion entirely — no line, no mention");
    // The always-available deep-dive chip remains.
    expect(getCoachPrompt("ai-specifics")).not.toBeNull();
  });

  it("resolves known ids and rejects unknown ones", () => {
    expect(getCoachPrompt("reviewer-questions")?.label).toBe("Reader questions");
    expect(getCoachPrompt("audience-fit")?.label).toBe("Audience fit");
    // Interactive-only: lives on its own chat route, not in the one-shot registry.
    expect(getCoachPrompt("defend-draft")).toBeNull();
    expect(getCoachPrompt("")).toBeNull();
  });

  it("keeps defend-the-draft out of the registry but complete", () => {
    expect(DEFEND_DRAFT.id).toBe("defend-draft");
    expect(COACH_PROMPTS.some((p) => p.id === DEFEND_DRAFT.id)).toBe(false);
    // The one-question-per-reply cadence is what makes the stateless chat work.
    expect(DEFEND_DRAFT.instructions).toContain("exactly one question per reply");
    expect(DEFEND_DRAFT.instructions).toContain("Question 1 of 5");
    // The persona comes from the lens, not a hardcoded program officer.
    expect(DEFEND_DRAFT.instructions).toContain("AUDIENCE LENS");
  });
});

describe("reed persona and safety", () => {
  it("speaks as Reed and reads for the lens's audience", () => {
    expect(COACH_SYSTEM).toContain("You are Reed");
    expect(COACH_SYSTEM).toContain("AUDIENCE LENS");
    expect(COACH_SYSTEM).not.toMatch(/tech nonprofit/i);
    expect(REVIEW_TITLE).toBe("Reed's Proposal Review");
  });

  it("keeps the safety rules and the critic-with-light-recommendations stance", () => {
    expect(COACH_SYSTEM).toContain("Refine, don't write");
    expect(COACH_SYSTEM).toContain("Never fabricate");
    expect(COACH_SYSTEM).toContain("Protect sensitive data");
    expect(COACH_SYSTEM).toContain("ONE directional suggestion");
    // Funder materials beat the lens on criteria — spec failure mode
    // "lens vs. pasted funder materials conflict".
    expect(COACH_SYSTEM).toContain("precedence over the audience lens");
  });

  it("keeps the CC BY 4.0 credit for the panel footer", () => {
    expect(COACH_ATTRIBUTION).toContain("Fast Forward");
  });
});

describe("audience lenses", () => {
  it("defines all four lenses completely", () => {
    expect(COACH_LENSES.map((l) => l.id).sort()).toEqual([
      "corporation",
      "family_foundation",
      "individual_donor",
      "institutional_foundation",
    ]);
    for (const l of COACH_LENSES) {
      expect(l.label.length).toBeGreaterThan(0);
      expect(l.readerTitle.length).toBeGreaterThan(0);
      expect(l.lensBlock.length).toBeGreaterThan(100);
      expect(l.audienceCriterion.name.length).toBeGreaterThan(0);
      expect(l.audienceCriterion.definition.length).toBeGreaterThan(40);
    }
  });

  it("resolves ids, with a working fallback default", () => {
    expect(getCoachLens("corporation")?.label).toBe("Corporation");
    expect(getCoachLens("nope")).toBeNull();
    expect(getCoachLens(null)).toBeNull();
    expect(getCoachLens(DEFAULT_LENS_ID)).not.toBeNull();
  });
});

describe("buildCoachUserPrompt", () => {
  it("carries every lens's block and audience criterion into the prompt", () => {
    for (const lens of COACH_LENSES) {
      const out = buildCoachUserPrompt({
        instructions: "Assess our proposal.",
        lens,
        proposal: "Our draft text.",
      });
      expect(out).toContain("AUDIENCE LENS");
      expect(out).toContain(lens.lensBlock);
      expect(out).toContain(lens.audienceCriterion.name);
      expect(out).toContain("precedence over this lens");
    }
  });

  it("fences the proposal and funder materials", () => {
    const out = buildCoachUserPrompt({
      instructions: "Assess our proposal.",
      lens: LENS,
      proposal: "  Our draft text.  ",
      funderMaterials: "Their RFP text.",
    });
    expect(out).toContain("Assess our proposal.");
    expect(out).toContain('PROPOSAL DRAFT:\n"""\nOur draft text.\n"""');
    expect(out).toContain('FUNDER MATERIALS:\n"""\nTheir RFP text.\n"""');
    expect(out).not.toContain("No funder materials provided.");
  });

  it("marks missing funder materials explicitly", () => {
    for (const funderMaterials of [null, undefined, "", "   "]) {
      const out = buildCoachUserPrompt({
        instructions: "x",
        lens: LENS,
        proposal: "Draft.",
        funderMaterials,
      });
      expect(out).toContain("No funder materials provided.");
      expect(out).not.toContain("FUNDER MATERIALS:");
    }
  });

  it("points at the attached PDF when the draft rides as a document block", () => {
    const out = buildCoachUserPrompt({ instructions: "x", lens: LENS, attachedPdf: true });
    expect(out).toContain("PROPOSAL DRAFT: attached to this message as a PDF document.");
    expect(out).not.toContain('"""');
  });

  it("refuses a run with no draft at all", () => {
    expect(() => buildCoachUserPrompt({ instructions: "x", lens: LENS })).toThrow();
    expect(() => buildCoachUserPrompt({ instructions: "x", lens: LENS, proposal: "  " })).toThrow();
  });
});
