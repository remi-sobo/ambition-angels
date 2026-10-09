import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { extractNameSpans } from "@/lib/capture/spans";
import { CAPTURE_DESTS } from "@/lib/capture/types";

// The eval fixtures (scripts/capture-eval.ts) stay well-formed, and the span
// extractor finds every name the fixture expects a card to land on. Fixture
// names are fictional and were checked against AA's data (no trigram hit at
// similarity >= 0.5) when they were written.

type Fixture = {
  name: string;
  transcript: string;
  context: null | { type: string; id: string };
  expected: { dest: string; entity: string | null }[];
  expected_youth_skipped_min?: number;
};

const DIR = join(process.cwd(), "tests", "fixtures", "capture");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

describe("capture eval fixtures", () => {
  test("there are at least five", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  for (const f of files) {
    const fx = JSON.parse(readFileSync(join(DIR, f), "utf8")) as Fixture;

    test(`${f}: well-formed`, () => {
      expect(fx.name.length).toBeGreaterThan(0);
      expect(fx.transcript.length).toBeGreaterThan(20);
      expect(fx.expected.length).toBeGreaterThan(0);
      for (const e of fx.expected) {
        expect(CAPTURE_DESTS).toContain(e.dest);
        expect(e.entity === null || typeof e.entity === "string").toBe(true);
      }
      // No real AA staff or constituent names leak into the fixtures by habit.
      expect(fx.transcript).not.toMatch(/Sobomehin|Koshland|Peninsula Community/);
    });

    test(`${f}: the span extractor reaches every expected entity`, () => {
      const spans = extractNameSpans(fx.transcript).map((s) => s.toLowerCase());
      for (const e of fx.expected) {
        if (!e.entity) continue;
        const want = e.entity.toLowerCase();
        const hit = spans.some((s) => want.includes(s) || s.includes(want));
        expect(hit, `${e.entity} in ${JSON.stringify(spans)}`).toBe(true);
      }
    });
  }
});
