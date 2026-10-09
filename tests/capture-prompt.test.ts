import { describe, expect, test } from "vitest";
import { TASK_CATEGORIES } from "@/app/admin/ops/_types/ops";
import { CAPTURE_TOOL, CAPTURE_TOOL_NAME, buildCapturePrompt, buildCaptureSystem } from "@/lib/capture/prompt";
import { MAX_CARDS, MAX_TRANSCRIPT_CHARS } from "@/lib/capture/constants";
import type { Candidate } from "@/lib/capture/types";

// Capture C2 step 5. The prompt is the trust model: refs only, no invented
// facts, youth skipped, voice rules. Pinned as text so a rewrite cannot
// silently drop a rule.

const c = (p: Partial<Candidate> & Pick<Candidate, "ref" | "kind" | "id" | "name">): Candidate => ({
  orgName: null,
  meta: null,
  sim: 0.9,
  spans: [],
  context: false,
  ...p,
});

const base = {
  transcript: "Just had coffee with Maria Chen from the Koshland Foundation.",
  todayIso: "2026-10-09",
  tz: "America/Los_Angeles",
  userName: "Remi",
  staff: [{ ref: "s1", name: "Shannon Example", handle: "shannon", userId: "u1" }],
  context: null,
  candidates: [
    c({ ref: "c1", kind: "constituent", id: "m1", name: "Maria Chen", meta: "person · last touch Sep 12, 2026", spans: ["Maria Chen"] }),
    c({ ref: "c2", kind: "partner", id: "p1", name: "Koshland Foundation", meta: "nonprofit · Palo Alto", spans: ["Koshland Foundation"] }),
    c({ ref: "c3", kind: "prospect", id: "pr1", name: "Peninsula Community Foundation" }),
  ],
};

describe("buildCaptureSystem", () => {
  const sys = buildCaptureSystem();

  test("is byte-stable and names the tool", () => {
    expect(buildCaptureSystem()).toBe(sys);
    expect(sys).toContain(`Call ${CAPTURE_TOOL_NAME} exactly once.`);
  });

  test("states every rule the spec requires", () => {
    expect(sys).toContain(`At most ${MAX_CARDS} cards`);
    expect(sys).toContain("ONLY by the candidate refs");
    expect(sys).toContain("Never invent a ref");
    expect(sys).toContain("Never add facts that were not said");
    expect(sys).toContain("Resolve relative dates");
    expect(sys).toContain("call, meeting, note, event (never email)");
    expect(sys).toContain("occurred_at defaults to today");
    expect(sys).toContain(TASK_CATEGORIES.join(", "));
    expect(sys).toContain("thought: an idea, lead, or parking-lot item with no owner or deadline. text only.");
    expect(sys).toContain("Never claim it was sent");
    expect(sys).toContain("youth_skipped");
    expect(sys).toContain("no em dashes, no exclamation marks");
    expect(sys).toContain("confidence is your 0 to 1 estimate");
    expect(sys).not.toMatch(/—/);
  });
});

describe("CAPTURE_TOOL", () => {
  test("is a forced tool with the cards/youth_skipped shape", () => {
    expect(CAPTURE_TOOL.name).toBe("submit_capture_cards");
    const schema = CAPTURE_TOOL.input_schema;
    expect(schema.required).toEqual(["cards", "youth_skipped"]);
    expect(schema.properties.cards.maxItems).toBe(MAX_CARDS);
    expect(schema.properties.cards.items.properties.dest.enum).toEqual(["interaction", "task", "thought", "message_draft"]);
    expect(schema.properties.cards.items.required).toContain("ref");
    expect(schema.properties.cards.items.required).toContain("confidence");
  });
});

describe("buildCapturePrompt", () => {
  test("carries the date, timezone, operator, staff refs, candidates, and transcript", () => {
    const p = buildCapturePrompt(base);
    expect(p).toContain("Today is 2026-10-09 (Friday, America/Los_Angeles).");
    expect(p).toContain("The operator dictating this note is Remi.");
    expect(p).toContain("- s1: Shannon Example");
    expect(p).toContain("- c1: Maria Chen (constituent · person · last touch Sep 12, 2026 · heard as \"Maria Chen\")");
    expect(p).toContain("- c2: Koshland Foundation (partner · nonprofit · Palo Alto · heard as \"Koshland Foundation\")");
    expect(p).toContain("- c3: Peninsula Community Foundation (prospect)");
    expect(p).toContain("never any other id");
    expect(p.endsWith(base.transcript)).toBe(true);
  });

  test("says so when there are no staff or no candidates", () => {
    const p = buildCapturePrompt({ ...base, staff: [], candidates: [] });
    expect(p).toContain("none listed; leave assignee_ref null");
    expect(p).toContain("none matched; use heard_name for anyone mentioned");
  });

  test("names the context entity as the default subject", () => {
    const p = buildCapturePrompt({
      ...base,
      context: { type: "partner", id: "p1", name: "Koshland Foundation", orgName: null, meta: "nonprofit" },
      candidates: [{ ...base.candidates[1], context: true }],
    });
    expect(p).toContain('recorded from the page of partner "Koshland Foundation"');
    expect(p).toContain("page context");
  });

  test("caps the transcript", () => {
    const p = buildCapturePrompt({ ...base, transcript: "x".repeat(MAX_TRANSCRIPT_CHARS + 50) });
    expect(p.split("Transcript:\n")[1]).toHaveLength(MAX_TRANSCRIPT_CHARS);
  });
});
