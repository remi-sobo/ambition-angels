import { describe, test, expect } from "vitest";
import {
  compileEdition,
  formatValue,
  printsHeading,
  renderMetric,
  slotText,
  MAX_BODY,
  type CompileMetric,
  type CompileStory,
} from "@/lib/comms/compile";
import type { FilledSlot, Slot } from "@/lib/comms/formats";

// Compile turns an edition into the plain text an email carries. The rules
// that matter: slot copy beats the story it came from, letters don't print
// headings, and nothing here ever appends a footer (the sender does that).

function slot(def: Partial<Slot> & { key: string }, fill: Partial<FilledSlot> = {}): FilledSlot {
  return {
    slot_key: def.key,
    slot_def: {
      key: def.key,
      label: def.label ?? def.key,
      kind: def.kind ?? "freeform",
      required: def.required ?? false,
      hint: def.hint,
    },
    story_id: null,
    metric_ids: null,
    content: null,
    position: 0,
    ...fill,
  };
}

const story = (over: Partial<CompileStory> = {}): CompileStory => ({
  id: "s1",
  title: "Marcus landed the internship",
  body: "After eight weeks, he interviewed and got the offer.",
  outcome: "He starts in September.",
  ...over,
});

const metric = (over: Partial<CompileMetric> = {}): CompileMetric => ({
  id: "m1",
  name: "Teens served",
  unit: null,
  latest: 47,
  captured_on: "2026-08-03",
  stale: false,
  ...over,
});

const compile = (
  slots: FilledSlot[],
  stories: CompileStory[] = [],
  metrics: CompileMetric[] = [],
) =>
  compileEdition({
    slots,
    storiesById: new Map(stories.map((s) => [s.id, s])),
    metricsById: new Map(metrics.map((m) => [m.id, m])),
  });

describe("formatValue", () => {
  test("thousands separate, integers keep no decimal tail", () => {
    expect(formatValue(47)).toBe("47");
    expect(formatValue(3500)).toBe("3,500");
  });
  test("fractions keep at most two places", () => {
    expect(formatValue(12.3456)).toBe("12.35");
  });
});

describe("renderMetric", () => {
  test("names the metric and its value", () => {
    expect(renderMetric(metric())).toBe("Teens served: 47");
  });
  test("appends the unit when there is one", () => {
    expect(renderMetric(metric({ unit: "hours" }))).toBe("Teens served: 47 hours");
  });
  test("says so rather than printing a zero when nothing is captured", () => {
    expect(renderMetric(metric({ latest: null }))).toBe("Teens served: not captured yet");
  });
  test("staleness never reaches the reader — it is a warning, not copy", () => {
    expect(renderMetric(metric({ stale: true }))).not.toMatch(/old|stale|ago/i);
  });
});

describe("printsHeading", () => {
  test("sections get a heading", () => {
    for (const k of ["story", "metrics", "freeform"]) expect(printsHeading(k)).toBe(true);
  });
  test("a letter and an ask do not — printing 'The opening' stops it being a letter", () => {
    expect(printsHeading("letter")).toBe(false);
    expect(printsHeading("ask")).toBe(false);
  });
});

describe("slotText", () => {
  const stories = new Map([["s1", story()]]);
  test("the slot's own copy wins", () => {
    const s = slot({ key: "a", kind: "story" }, { story_id: "s1", content: "Edited for the newsletter." });
    expect(slotText(s, stories)).toBe("Edited for the newsletter.");
  });
  test("whitespace-only copy is not copy", () => {
    const s = slot({ key: "a", kind: "story" }, { story_id: "s1", content: "   \n  " });
    expect(slotText(s, stories)).toContain("interviewed");
  });
  test("the story is the fallback, body then outcome", () => {
    const s = slot({ key: "a", kind: "story" }, { story_id: "s1" });
    expect(slotText(s, stories)).toBe(
      "After eight weeks, he interviewed and got the offer.\n\nHe starts in September.",
    );
  });
  test("a story that isn't publishable any more contributes nothing", () => {
    const s = slot({ key: "a", kind: "story" }, { story_id: "gone" });
    expect(slotText(s, stories)).toBe("");
  });
});

describe("compileEdition", () => {
  test("stitches slots in position order, not array order", () => {
    const out = compile([
      slot({ key: "b", label: "Second", kind: "freeform" }, { content: "Two", position: 1 }),
      slot({ key: "a", label: "First", kind: "freeform" }, { content: "One", position: 0 }),
    ]);
    expect(out.body.indexOf("One")).toBeLessThan(out.body.indexOf("Two"));
  });

  test("a letter's label never appears in the body", () => {
    const out = compile([
      slot({ key: "l", label: "Letter from the leader", kind: "letter" }, { content: "Friends," }),
    ]);
    expect(out.body).toBe("Friends,");
    expect(out.body).not.toContain("Letter from the leader");
  });

  test("a story section prints its label above the copy", () => {
    const out = compile(
      [slot({ key: "p", label: "Person spotlight", kind: "story" }, { story_id: "s1" })],
      [story()],
    );
    expect(out.body.startsWith("Person spotlight\n\n")).toBe(true);
  });

  test("metrics render one per line under the heading", () => {
    const out = compile(
      [slot({ key: "n", label: "By the numbers", kind: "metrics" }, { metric_ids: ["m1", "m2"] })],
      [],
      [metric(), metric({ id: "m2", name: "Hours mentored", latest: 1100 })],
    );
    expect(out.body).toBe("By the numbers\nTeens served: 47\nHours mentored: 1,100");
  });

  test("an empty optional slot is simply not in this edition", () => {
    const out = compile([
      slot({ key: "l", kind: "letter" }, { content: "Friends," }),
      slot({ key: "next", label: "What's coming", kind: "freeform" }),
    ]);
    expect(out.body).toBe("Friends,");
    expect(out.blocked).toEqual([]);
  });

  test("an empty REQUIRED slot blocks compile and names itself", () => {
    const out = compile([
      slot({ key: "l", kind: "letter" }, { content: "Friends," }),
      slot({ key: "ask", label: "Support the work", kind: "ask", required: true }),
    ]);
    expect(out.blocked).toEqual(['"Support the work" is required and still empty.']);
  });

  test("a slot with no slots at all is blocked, not silently empty", () => {
    expect(compile([]).blocked).toContain("This edition has no slots.");
  });

  test("a stale metric warns without saying so in the email", () => {
    const out = compile(
      [slot({ key: "n", label: "Numbers", kind: "metrics" }, { metric_ids: ["m1"] })],
      [],
      [metric({ stale: true, captured_on: "2026-01-04" })],
    );
    expect(out.warnings).toEqual(['"Teens served" was last captured Jan 4, 2026.']);
    expect(out.body).not.toContain("Jan 4");
  });

  test("a deleted metric warns and is left out rather than printing a blank line", () => {
    const out = compile(
      [slot({ key: "n", label: "Numbers", kind: "metrics" }, { metric_ids: ["gone"] })],
      [],
      [],
    );
    expect(out.warnings[0]).toContain("no longer exists");
    expect(out.body).not.toContain("Numbers");
  });

  test("a story whose consent lapsed blocks compile and names the slot", () => {
    const out = compile(
      [slot({ key: "p", label: "Person spotlight", kind: "story" }, { story_id: "s1" })],
      [], // v_publishable_stories no longer answers for s1
    );
    expect(out.blocked).toHaveLength(1);
    expect(out.blocked[0]).toContain("Person spotlight");
    expect(out.blocked[0]).toContain("current consent");
  });

  test("a lapsed story blocks even when the slot has its own edited copy", () => {
    // The copy was derived from the story, so a revocation reaches it too.
    // Editing the words does not launder consent.
    const out = compile([
      slot({ key: "p", label: "Person spotlight", kind: "story" }, {
        story_id: "s1",
        content: "Edited for the newsletter.",
      }),
    ]);
    expect(out.blocked).toHaveLength(1);
    expect(out.body).not.toContain("Edited for the newsletter.");
  });

  test("compile never appends a footer, address, or unsubscribe — the sender does", () => {
    const out = compile([
      slot({ key: "l", kind: "letter" }, { content: "Friends," }),
      slot({ key: "ask", kind: "ask" }, { content: "Give if you can." }),
    ]);
    expect(out.body).toBe("Friends,\n\n\nGive if you can.");
    expect(out.body.toLowerCase()).not.toMatch(/unsubscribe|mailing address/);
  });

  test("an over-long edition is trimmed to the campaign cap and says so", () => {
    const out = compile([
      slot({ key: "l", kind: "letter" }, { content: "x".repeat(MAX_BODY + 500) }),
    ]);
    expect(out.body.length).toBe(MAX_BODY);
    expect(out.warnings.some((w) => w.includes("trimmed"))).toBe(true);
  });

  test("completeness comes back with the result so one read answers both questions", () => {
    const out = compile([
      slot({ key: "l", kind: "letter", required: true }, { content: "Friends," }),
      slot({ key: "n", label: "Numbers", kind: "metrics", required: true }),
    ]);
    expect(out.completeness.label).toBe("1 of 2 slots filled");
    expect(out.completeness.canCompile).toBe(false);
  });
});
