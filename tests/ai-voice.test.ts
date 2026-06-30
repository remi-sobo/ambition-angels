import { describe, expect, test } from "vitest";
import { cleanVoiceText, cleanVoiceDeep, violatesVoice } from "@/lib/ai/voice";

describe("cleanVoiceText", () => {
  test("turns a spaced em dash into a comma-pause", () => {
    expect(cleanVoiceText("we shipped it — and it held")).toBe("we shipped it, and it held");
  });

  test("leaves an en dash alone so numeric and date ranges survive", () => {
    expect(cleanVoiceText("$1M–$5M over 2020–2024")).toBe("$1M–$5M over 2020–2024");
  });

  test("collapses the double comma the replacement can create", () => {
    expect(cleanVoiceText("one, — two")).toBe("one, two");
  });

  test("leaves a literal hyphen-minus alone (ranges and hyphenated words survive)", () => {
    expect(cleanVoiceText("$50,000-$70,000 full-time")).toBe("$50,000-$70,000 full-time");
  });

  test("is a no-op on clean text and empty input", () => {
    expect(cleanVoiceText("nothing to fix here")).toBe("nothing to fix here");
    expect(cleanVoiceText("")).toBe("");
  });
});

describe("violatesVoice", () => {
  test("flags an em dash, passes en dashes and clean text", () => {
    expect(violatesVoice("a — b")).toBe(true);
    expect(violatesVoice("a – b")).toBe(false); // en dash is allowed
    expect(violatesVoice("a, b")).toBe(false);
    expect(violatesVoice("")).toBe(false);
  });
});

describe("cleanVoiceDeep", () => {
  test("repairs string leaves and preserves structure, numbers, and nulls", () => {
    const input = {
      title: "Maker — builder",
      salary: "$50,000–$70,000", // en dash range — must survive
      score: 7,
      active: true,
      note: null,
      tags: ["fast — cheap", "good"],
    };
    expect(cleanVoiceDeep(input)).toEqual({
      title: "Maker, builder",
      salary: "$50,000–$70,000",
      score: 7,
      active: true,
      note: null,
      tags: ["fast, cheap", "good"],
    });
  });

  test("passes primitives through unchanged", () => {
    expect(cleanVoiceDeep(42)).toBe(42);
    expect(cleanVoiceDeep(null)).toBe(null);
  });
});
