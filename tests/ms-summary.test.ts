import { describe, expect, test } from "vitest";

import { buildSummaryPrompt, SUMMARY_SYSTEM_PROMPT } from "../lib/ms/summary";

describe("summary prompt — safety is structural", () => {
  test("the system prompt forbids deficit language explicitly", () => {
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Strengths only/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/forbidden/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Exactly three sentences/);
  });

  test("the user prompt is built from sums and titles only — no free text slot exists", () => {
    const prompt = buildSummaryPrompt(
      { build: 1, analyze: 2, create: 3, help: 19, lead: 5, organize: 6 },
      ["Registered Nurses", "Surgical Technologists"]
    );
    expect(prompt).toContain("help");
    expect(prompt).toContain("Registered Nurses");
    // The three strongest traits, strongest first.
    expect(prompt.indexOf("help")).toBeLessThan(prompt.indexOf("organize"));
  });

  test("empty title list still builds a valid prompt", () => {
    const prompt = buildSummaryPrompt(
      { build: 0, analyze: 0, create: 0, help: 0, lead: 0, organize: 0 },
      []
    );
    expect(prompt).toContain("Write the three sentences.");
    expect(prompt).not.toContain("Work that matches");
  });
});
