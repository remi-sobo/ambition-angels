import { describe, expect, test } from "vitest";
import { MAX_AGENDA_CHARS, buildTranscriptPrompt } from "@/lib/meetings/transcript-prompt";

describe("buildTranscriptPrompt", () => {
  const base = { title: "Coffee with Ada", transcript: "We talked about the gala.", attendees: ["Ada Lovelace"] };

  test("without an agenda: plain summary instruction, no debrief or agenda block", () => {
    const p = buildTranscriptPrompt({ ...base });
    expect(p).toContain("A 2–3 sentence summary");
    expect(p).not.toContain("prep agenda");
    expect(p).not.toContain("debrief");
    expect(p).toContain("Coffee with Ada");
    expect(p).toContain("Ada Lovelace");
    expect(p).toContain("We talked about the gala.");
  });

  test("with an agenda: switches to a prep-vs-actual debrief and embeds the agenda", () => {
    const p = buildTranscriptPrompt({ ...base, agenda: "1. Thank her for the $5k. 2. Float a board seat." });
    expect(p).toContain("debrief");
    expect(p).toContain("comparing against the prep agenda");
    expect(p).toContain("PRIORITIZING the agenda items that were not resolved");
    expect(p).toContain("Prep agenda (drafted before the meeting):");
    expect(p).toContain("Float a board seat.");
  });

  test("blank/whitespace agenda is treated as no agenda", () => {
    const p = buildTranscriptPrompt({ ...base, agenda: "   \n  " });
    expect(p).toContain("A 2–3 sentence summary");
    expect(p).not.toContain("Prep agenda (drafted before the meeting):");
  });

  test("caps the embedded agenda at MAX_AGENDA_CHARS", () => {
    const huge = "agenda item ".repeat(1000);
    const p = buildTranscriptPrompt({ ...base, agenda: huge });
    // The transcript marker still appears, and the embedded agenda is bounded.
    const start = p.indexOf("Prep agenda (drafted before the meeting):\n") + "Prep agenda (drafted before the meeting):\n".length;
    const end = p.indexOf("\nTranscript:");
    expect(end - start).toBeLessThanOrEqual(MAX_AGENDA_CHARS);
  });
});
