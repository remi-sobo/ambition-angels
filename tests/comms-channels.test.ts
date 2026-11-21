import { describe, expect, test } from "vitest";

import {
  buildComposerPrompt,
  CHANNELS,
  CHANNEL_LIST,
  CHANNEL_SPECS,
  COMPOSER_SYSTEM,
  isChannel,
  provenanceNote,
} from "../lib/comms/channels";

const base = {
  channel: "linkedin" as const,
  title: "a young person landed the internship",
  body: "After eight weeks, a young person interviewed at a local firm.",
  outcome: "They start in September.",
  subjectDescriptions: ["a young person — refer to them ONLY this way, never invent a name"],
  metrics: [] as Array<{ name: string; value: number; unit: string | null; captured_on: string | null }>,
  orgName: "Ambition Angels",
};

describe("channel vocabulary", () => {
  test("every channel in the list has a spec, and vice versa", () => {
    expect(CHANNEL_LIST).toHaveLength(CHANNELS.length);
    for (const c of CHANNELS) expect(CHANNEL_SPECS[c].key).toBe(c);
  });

  test("the vocabulary matches the database check constraint", () => {
    // comms_phase3_outputs.sql pins the same seven values. Change one, change
    // both — a channel the DB rejects would fail only at insert time, after
    // the model call was already paid for.
    expect([...CHANNELS].sort()).toEqual(
      [
        "board_update",
        "grant_anecdote",
        "linkedin",
        "news_flash",
        "newsletter_section",
        "personal_forward",
        "thank_you",
      ].sort(),
    );
  });

  test("isChannel rejects anything not in the vocabulary", () => {
    expect(isChannel("linkedin")).toBe(true);
    expect(isChannel("twitter")).toBe(false);
    expect(isChannel(null)).toBe(false);
    expect(isChannel(42)).toBe(false);
  });

  test("every channel is short-form — none invites an essay", () => {
    for (const c of CHANNEL_LIST) expect(c.maxTokens).toBeLessThanOrEqual(700);
  });
});

describe("COMPOSER_SYSTEM", () => {
  test("restates the redaction rule, so a gap can't be filled with an invented name", () => {
    expect(COMPOSER_SYSTEM).toMatch(/NEVER invent a name/);
    expect(COMPOSER_SYSTEM).toMatch(/placeholder/i);
  });

  test("forbids inventing numbers as well as names", () => {
    expect(COMPOSER_SYSTEM).toMatch(/Do not invent numbers/);
  });

  test("asks for the finished text only — the sheet renders one draft, not options", () => {
    expect(COMPOSER_SYSTEM).toMatch(/Return only the finished text/);
  });
});

describe("buildComposerPrompt", () => {
  test("carries the story and the channel's own guidance", () => {
    const p = buildComposerPrompt(base);
    expect(p).toContain("a young person landed the internship");
    expect(p).toContain(CHANNEL_SPECS.linkedin.guidance);
    expect(p).toContain("Ambition Angels");
  });

  test("tells the model how it may refer to each person", () => {
    expect(buildComposerPrompt(base)).toContain("never invent a name");
  });

  test("omits sections that have no content rather than sending empty headings", () => {
    const p = buildComposerPrompt({ ...base, body: null, outcome: null, subjectDescriptions: [] });
    expect(p).not.toContain("What happened:");
    expect(p).not.toContain("What changed:");
    expect(p).not.toContain("PEOPLE IN THIS STORY");
    expect(p).not.toContain("NUMBERS YOU MAY USE");
  });

  test("metrics arrive as exact resolved values with their as-of date", () => {
    const p = buildComposerPrompt({
      ...base,
      metrics: [{ name: "Teens served", value: 47, unit: "teens", captured_on: "2026-08-01" }],
    });
    expect(p).toContain("Teens served: 47 teens (as of 2026-08-01)");
    expect(p).toContain("do not round or extrapolate");
  });

  test("a metric with no unit or date still renders cleanly", () => {
    const p = buildComposerPrompt({
      ...base,
      metrics: [{ name: "Schools", value: 12, unit: null, captured_on: null }],
    });
    expect(p).toContain("- Schools: 12");
  });

  test("each channel produces a different instruction", () => {
    const prompts = CHANNELS.map((c) => buildComposerPrompt({ ...base, channel: c }));
    expect(new Set(prompts).size).toBe(CHANNELS.length);
  });
});

describe("provenanceNote", () => {
  test("says what fed the draft and that names were removed", () => {
    const n = provenanceNote({ metricCount: 2, redactionCount: 3, model: "claude-sonnet-4-6" });
    expect(n).toContain("grounded in this story");
    expect(n).toContain("plus 2 metrics");
    expect(n).toContain("names redacted (3 replaced)");
    expect(n).toContain("claude-sonnet-4-6");
  });

  test("singular metric reads as English", () => {
    expect(provenanceNote({ metricCount: 1, redactionCount: 0, model: "m" })).toContain(
      "plus 1 metric;",
    );
  });

  test("is honest when there was nothing to redact — not silent", () => {
    // Saying "no names to redact" is different from saying nothing: on a story
    // about the org itself, silence would read as "redaction didn't run".
    expect(provenanceNote({ metricCount: 0, redactionCount: 0, model: "m" })).toContain(
      "no names to redact",
    );
  });
});
