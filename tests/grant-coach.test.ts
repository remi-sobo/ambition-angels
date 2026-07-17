import { describe, it, expect } from "vitest";
import {
  COACH_PROMPTS,
  COACH_SYSTEM,
  COACH_ATTRIBUTION,
  DEFEND_DRAFT,
  getCoachPrompt,
  buildCoachUserPrompt,
} from "@/lib/fundraising/grantCoach";

// The coach's value is prompt fidelity: every prompt reaches the model intact,
// with the draft and funder materials clearly fenced, and the safety rules
// (refine-don't-write, never fabricate) riding on every call via the system
// prompt. These tests freeze that contract.

describe("grant coach prompt registry", () => {
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

  it("includes the assessment as the entry point, with its rating scale", () => {
    const assessment = getCoachPrompt("assessment");
    expect(assessment).not.toBeNull();
    expect(assessment!.instructions).toContain("Developing / Strong / Standout");
    expect(assessment!.instructions).toContain("Where to go deeper");
  });

  it("resolves known ids and rejects unknown ones", () => {
    expect(getCoachPrompt("reviewer-questions")?.label).toBe("Reviewer questions");
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
  });

  it("keeps the safety rules in the shared system prompt", () => {
    expect(COACH_SYSTEM).toContain("Refine, don't write");
    expect(COACH_SYSTEM).toContain("Never fabricate");
    expect(COACH_SYSTEM).toContain("Protect sensitive data");
    // The CC BY 4.0 credit must exist for the panel to render.
    expect(COACH_ATTRIBUTION).toContain("Fast Forward");
  });
});

describe("buildCoachUserPrompt", () => {
  it("fences the proposal and funder materials", () => {
    const out = buildCoachUserPrompt({
      instructions: "Assess our proposal.",
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
        proposal: "Draft.",
        funderMaterials,
      });
      expect(out).toContain("No funder materials provided.");
      expect(out).not.toContain("FUNDER MATERIALS:");
    }
  });

  it("points at the attached PDF when the draft rides as a document block", () => {
    const out = buildCoachUserPrompt({ instructions: "x", attachedPdf: true });
    expect(out).toContain("PROPOSAL DRAFT: attached to this message as a PDF document.");
    expect(out).not.toContain('"""');
  });

  it("refuses a run with no draft at all", () => {
    expect(() => buildCoachUserPrompt({ instructions: "x" })).toThrow();
    expect(() => buildCoachUserPrompt({ instructions: "x", proposal: "  " })).toThrow();
  });
});
