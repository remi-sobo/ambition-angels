import { describe, expect, test } from "vitest";

import {
  editionCompleteness,
  editionTitleFor,
  isSlotFilled,
  MAX_SLOTS,
  parseSlots,
  planDates,
  reorderSlots,
  SEED_FORMATS,
  SLOT_KINDS,
  slotKeyFrom,
  type FilledSlot,
  type Slot,
} from "../lib/comms/formats";

const slot = (over: Partial<Slot> & { key: string }): Slot => ({
  label: "A slot",
  kind: "freeform",
  required: false,
  ...over,
});

const filled = (over: Partial<FilledSlot> & { slot_key: string; slot_def: Slot }): FilledSlot => ({
  story_id: null,
  metric_ids: null,
  content: null,
  position: 0,
  ...over,
});

describe("seed formats", () => {
  test("four starters, one per cadence the spec names", () => {
    expect(SEED_FORMATS.map((f) => f.name)).toEqual([
      "Quarterly newsletter",
      "News flash",
      "Monthly update",
      "Annual appeal letter",
    ]);
    expect(SEED_FORMATS.map((f) => f.cadence).sort()).toEqual([
      "adhoc",
      "annual",
      "monthly",
      "quarterly",
    ]);
  });

  test("the quarterly seed is the seven-slot structure the coaching session taught", () => {
    const q = SEED_FORMATS[0];
    expect(q.slots.map((s) => s.key)).toEqual([
      "letter",
      "person",
      "program",
      "work",
      "numbers",
      "next",
      "ask",
    ]);
    expect(q.slots.filter((s) => s.required).map((s) => s.key)).toEqual([
      "letter",
      "person",
      "work",
      "numbers",
      "ask",
    ]);
  });

  test("labels stay generic — no tenant's vocabulary ships as the default", () => {
    const all = SEED_FORMATS.flatMap((f) => f.slots.map((s) => `${s.label} ${s.hint ?? ""}`)).join(" ");
    for (const tenantWord of ["Campus", "Club", "Angel", "SafeSpace", "Ambition"]) {
      expect(all).not.toContain(tenantWord);
    }
  });

  test("every seed slot is valid under the parser it will be re-saved through", () => {
    for (const f of SEED_FORMATS) expect(() => parseSlots(f.slots)).not.toThrow();
  });

  test("every seed has an ask slot — the support line is always present", () => {
    for (const f of SEED_FORMATS) {
      expect(f.slots.some((s) => s.kind === "ask")).toBe(true);
    }
  });

  test("the news flash stays small on purpose", () => {
    const flash = SEED_FORMATS.find((f) => f.name === "News flash")!;
    expect(flash.slots.filter((s) => s.required)).toHaveLength(1);
  });
});

describe("slotKeyFrom", () => {
  test("derives a readable key from a label", () => {
    expect(slotKeyFrom("Person spotlight")).toBe("person_spotlight");
    expect(slotKeyFrom("What's coming?")).toBe("what_s_coming");
  });

  test("disambiguates against keys already in the format", () => {
    expect(slotKeyFrom("Story", ["story"])).toBe("story_2");
    expect(slotKeyFrom("Story", ["story", "story_2"])).toBe("story_3");
  });

  test("never returns empty, even for a label with no usable characters", () => {
    expect(slotKeyFrom("!!!")).toBe("slot");
    expect(slotKeyFrom("   ")).toBe("slot");
  });
});

describe("parseSlots", () => {
  test("accepts a well-formed list", () => {
    const out = parseSlots([{ key: "a", label: "A", kind: "story", required: true }]);
    expect(out).toEqual([{ key: "a", label: "A", kind: "story", required: true }]);
  });

  test("AN EXISTING KEY IS NEVER RE-DERIVED — this is the rename trap", () => {
    // Renaming "Program spotlight" to "Campus spotlight" must keep key
    // "program". If the key followed the label, every edition created before
    // the rename would lose its reference to that slot's content.
    const out = parseSlots([
      { key: "program", label: "Campus spotlight", kind: "story", required: false },
    ]);
    expect(out[0].key).toBe("program");
    expect(out[0].label).toBe("Campus spotlight");
  });

  test("a new slot with no key gets one derived from its label", () => {
    expect(parseSlots([{ label: "Fresh idea", kind: "freeform" }])[0].key).toBe("fresh_idea");
  });

  test("two new slots with the same label get distinct keys", () => {
    const out = parseSlots([
      { label: "Story", kind: "story" },
      { label: "Story", kind: "story" },
    ]);
    expect(out[0].key).not.toBe(out[1].key);
  });

  test("rejects duplicate explicit keys rather than silently dropping one", () => {
    expect(() =>
      parseSlots([
        { key: "a", label: "One", kind: "story" },
        { key: "a", label: "Two", kind: "story" },
      ]),
    ).toThrow(/share the key/);
  });

  test("rejects an unknown kind", () => {
    expect(() => parseSlots([{ label: "X", kind: "video" }])).toThrow(/unknown kind/);
  });

  test("rejects a missing label, an empty format, and a non-list", () => {
    expect(() => parseSlots([{ kind: "story" }])).toThrow(/needs a label/);
    expect(() => parseSlots([])).toThrow(/at least one slot/);
    expect(() => parseSlots("nope")).toThrow(/must be a list/);
  });

  test("caps the slot count", () => {
    const many = Array.from({ length: MAX_SLOTS + 1 }, (_, i) => ({
      label: `S${i}`,
      kind: "freeform",
    }));
    expect(() => parseSlots(many)).toThrow(/at most/);
  });

  test("required defaults to false rather than truthy-coercing", () => {
    expect(parseSlots([{ label: "X", kind: "freeform", required: "yes" }])[0].required).toBe(false);
  });

  test("an empty hint is dropped, not stored as an empty string", () => {
    expect(parseSlots([{ label: "X", kind: "freeform", hint: "   " }])[0].hint).toBeUndefined();
  });
});

describe("reorderSlots", () => {
  const list = [slot({ key: "a" }), slot({ key: "b" }), slot({ key: "c" })];

  test("moves a slot down and up", () => {
    expect(reorderSlots(list, 0, 2).map((s) => s.key)).toEqual(["b", "c", "a"]);
    expect(reorderSlots(list, 2, 0).map((s) => s.key)).toEqual(["c", "a", "b"]);
  });

  test("out-of-range and no-op moves return the list unchanged", () => {
    expect(reorderSlots(list, 1, 1).map((s) => s.key)).toEqual(["a", "b", "c"]);
    expect(reorderSlots(list, -1, 2).map((s) => s.key)).toEqual(["a", "b", "c"]);
    expect(reorderSlots(list, 0, 9).map((s) => s.key)).toEqual(["a", "b", "c"]);
  });

  test("does not mutate its input", () => {
    reorderSlots(list, 0, 2);
    expect(list.map((s) => s.key)).toEqual(["a", "b", "c"]);
  });
});

describe("isSlotFilled — kind decides what filled means", () => {
  test("a story slot is filled by a story OR by written copy", () => {
    const def = slot({ key: "s", kind: "story" });
    expect(isSlotFilled(filled({ slot_key: "s", slot_def: def }))).toBe(false);
    expect(isSlotFilled(filled({ slot_key: "s", slot_def: def, story_id: "x" }))).toBe(true);
    expect(isSlotFilled(filled({ slot_key: "s", slot_def: def, content: "words" }))).toBe(true);
  });

  test("a metrics slot needs METRICS — prose beside it doesn't count", () => {
    const def = slot({ key: "n", kind: "metrics" });
    expect(isSlotFilled(filled({ slot_key: "n", slot_def: def, content: "lots of words" }))).toBe(
      false,
    );
    expect(isSlotFilled(filled({ slot_key: "n", slot_def: def, metric_ids: ["m1"] }))).toBe(true);
  });

  test("text slots need non-whitespace text", () => {
    for (const kind of ["letter", "ask", "freeform"] as const) {
      const def = slot({ key: kind, kind });
      expect(isSlotFilled(filled({ slot_key: kind, slot_def: def, content: "   " }))).toBe(false);
      expect(isSlotFilled(filled({ slot_key: kind, slot_def: def, content: "hi" }))).toBe(true);
    }
  });

  test("every kind is covered", () => {
    for (const kind of SLOT_KINDS) {
      expect(() => isSlotFilled(filled({ slot_key: kind, slot_def: slot({ key: kind, kind }) }))).not.toThrow();
    }
  });
});

describe("editionCompleteness", () => {
  const story = slot({ key: "s", kind: "story", required: true, label: "The work" });
  const optional = slot({ key: "n", kind: "freeform", required: false, label: "What's coming" });

  test("counts filled slots and names the required ones still missing", () => {
    const c = editionCompleteness([
      filled({ slot_key: "s", slot_def: story }),
      filled({ slot_key: "n", slot_def: optional, content: "next up" }),
    ]);
    expect(c.label).toBe("1 of 2 slots filled");
    expect(c.requiredMissing).toEqual(["The work"]);
    expect(c.canCompile).toBe(false);
  });

  test("compile unlocks when every REQUIRED slot is filled, optional or not", () => {
    const c = editionCompleteness([
      filled({ slot_key: "s", slot_def: story, story_id: "x" }),
      filled({ slot_key: "n", slot_def: optional }),
    ]);
    expect(c.canCompile).toBe(true);
    expect(c.label).toBe("1 of 2 slots filled");
  });

  test("an edition with no slots can't compile", () => {
    expect(editionCompleteness([]).canCompile).toBe(false);
  });
});

describe("planDates — the deadlines exist months out", () => {
  test("quarterly lands on the giving calendar, not on even thirds", () => {
    const d = planDates("quarterly", "2026-06-01");
    expect(d).toHaveLength(4);
    expect(d[0]).toBe("2026-08-15");
    expect(d[1]).toBe("2026-11-01");
    expect(d[2]).toBe("2027-02-25");
    expect(d[3]).toBe("2027-05-15");
  });

  test("a spring start still catches that same May, not next year's", () => {
    // The cycle is a program year; starting in March must not skip forward to
    // August. This is the case that made the first implementation wrong.
    expect(planDates("quarterly", "2026-03-01")[0]).toBe("2026-05-15");
  });

  test("the four dates are strictly increasing and span a program year", () => {
    const d = planDates("quarterly", "2026-06-01");
    expect(d).toEqual([...d].sort());
    expect(new Set(d).size).toBe(4);
  });

  test("quarterly started late in the year rolls into next year", () => {
    const d = planDates("quarterly", "2026-12-01");
    expect(d).toHaveLength(4);
    expect(d.every((x) => x > "2026-12-01")).toBe(true);
  });

  test("monthly gives twelve firsts", () => {
    const d = planDates("monthly", "2026-06-10");
    expect(d).toHaveLength(12);
    expect(d[0]).toBe("2026-07-01");
    expect(d[11]).toBe("2027-06-01");
  });

  test("annual is the November appeal", () => {
    expect(planDates("annual", "2026-06-01")).toEqual(["2026-11-01"]);
    expect(planDates("annual", "2026-12-01")).toEqual(["2027-11-01"]);
  });

  test("adhoc plans nothing — a news flash has no schedule by definition", () => {
    expect(planDates("adhoc", "2026-06-01")).toEqual([]);
  });

  test("every planned date is in the future relative to the start", () => {
    for (const c of ["quarterly", "monthly", "annual"] as const) {
      for (const d of planDates(c, "2026-08-19")) expect(d >= "2026-08-19").toBe(true);
    }
  });
});

describe("editionTitleFor", () => {
  test("newsletters read by season", () => {
    expect(editionTitleFor("Quarterly newsletter", "2026-11-01")).toBe("Fall 2026 newsletter");
    expect(editionTitleFor("Quarterly newsletter", "2027-02-25")).toBe("Winter 2027 newsletter");
  });

  test("monthly reads by month, annual by year", () => {
    expect(editionTitleFor("Monthly update", "2026-07-01")).toBe("July 2026 update");
    expect(editionTitleFor("Annual appeal letter", "2026-11-01")).toBe("2026 appeal");
  });

  test("an org's own format name still gets a usable title", () => {
    expect(editionTitleFor("Club letter", "2026-09-01")).toBe("Club letter — September 2026");
  });
});
