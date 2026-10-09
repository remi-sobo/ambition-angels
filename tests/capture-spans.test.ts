import { describe, expect, test } from "vitest";
import { extractNameSpans } from "@/lib/capture/spans";
import { MAX_SPANS } from "@/lib/capture/constants";

// Capture C2 step 3: the matcher only ever sees these spans, so what they
// catch and what they skip decides which records can be matched at all.

const lower = (xs: string[]) => xs.map((s) => s.toLowerCase());

describe("extractNameSpans", () => {
  test("person plus organization in one sentence", () => {
    const spans = extractNameSpans("Just had coffee with Maria Chen from the Koshland Foundation.");
    expect(spans).toContain("Maria Chen");
    expect(spans).toContain("Koshland Foundation");
    expect(spans).not.toContain("Just");
    expect(spans).not.toContain("Just Maria");
  });

  test("a sentence-initial single first name is kept", () => {
    expect(extractNameSpans("Kendra called about the gala.")).toContain("Kendra");
  });

  test("a sentence-initial two-word name is kept", () => {
    expect(extractNameSpans("Maria Chen wants the impact numbers.")).toContain("Maria Chen");
  });

  test("a sentence opener is not a name", () => {
    const spans = extractNameSpans("Also she mentioned the numbers. Then we talked. Have Shannon send it.");
    expect(spans).not.toContain("Also");
    expect(spans).not.toContain("Then");
    expect(spans).not.toContain("Have");
    expect(spans).not.toContain("Have Shannon");
  });

  test("a family referred to in the plural", () => {
    expect(extractNameSpans("I ran into the Sobomehins at the board event.")).toEqual(["Sobomehins"]);
  });

  test("lowercase speech-to-text output falls back to cue words", () => {
    const spans = lower(
      extractNameSpans("had coffee with maria chen from koshland. tell shannon to send the one pager by friday."),
    );
    expect(spans).toContain("maria chen");
    expect(spans).toContain("koshland");
    expect(spans).not.toContain("friday");
    expect(spans).not.toContain("the one pager");
  });

  test("weekdays, months, and pronouns are never spans", () => {
    const spans = extractNameSpans("Have Shannon send her the impact one-pager by Friday. She wants it before November.");
    expect(spans).not.toContain("Friday");
    expect(spans).not.toContain("November");
    expect(spans).not.toContain("She");
    expect(spans).toContain("Shannon");
  });

  test("multi-word organization names stay whole", () => {
    const spans = extractNameSpans("She mentioned Peninsula Community Foundation is opening a youth workforce round.");
    expect(spans).toEqual(["Peninsula Community Foundation"]);
  });

  test("honorifics and apostrophes survive", () => {
    const spans = extractNameSpans("Call Dr. O'Brien at St. Mary's Hospital next week.");
    expect(spans.some((s) => /O'Brien$/.test(s))).toBe(true);
    expect(spans.some((s) => /Mary's Hospital$/.test(s))).toBe(true);
    expect(spans).not.toContain("Call");
  });

  test("two people joined by 'and' are two spans", () => {
    expect(extractNameSpans("Met with Tunde and Niyi for lunch.")).toEqual(["Tunde", "Niyi"]);
  });

  test("cue verbs at sentence start do not swallow the name", () => {
    const spans = extractNameSpans("Email Priya Natarajan the deck. Then text Jordan Lee.");
    expect(spans).toContain("Priya Natarajan");
    expect(spans).toContain("Jordan Lee");
    expect(spans).not.toContain("Email Priya Natarajan");
  });

  test("dedupes case-insensitively and caps at MAX_SPANS", () => {
    const names = Array.from({ length: 20 }, (_, i) => `Person${String.fromCharCode(65 + i)} Lastname`);
    const transcript = names.map((n) => `Talked with ${n} today.`).join(" ") + " Talked with personA Lastname again.";
    const spans = extractNameSpans(transcript);
    expect(spans).toHaveLength(MAX_SPANS);
    expect(new Set(lower(spans)).size).toBe(spans.length);
  });

  test("empty input yields no spans", () => {
    expect(extractNameSpans("")).toEqual([]);
    expect(extractNameSpans("   ")).toEqual([]);
  });
});
