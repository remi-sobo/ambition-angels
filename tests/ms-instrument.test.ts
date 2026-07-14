import { describe, expect, test } from "vitest";

import { ITEMS, SCALE, MAX_ANSWER, answersToTraits } from "../lib/ms/instrument";
import { TRAIT_TO_RIASEC, type TraitKey } from "../lib/ms/riasec";
import { newClaimCode, normalizeClaimCode, CLAIM_CODE_LENGTH } from "../lib/ms/claim";

describe("instrument structure — a content edit cannot silently unbalance the profile", () => {
  test("30 items, exactly 5 per dimension", () => {
    expect(ITEMS).toHaveLength(30);
    const counts = new Map<TraitKey, number>();
    for (const item of ITEMS) counts.set(item.trait, (counts.get(item.trait) ?? 0) + 1);
    for (const trait of Object.keys(TRAIT_TO_RIASEC) as TraitKey[]) {
      expect(counts.get(trait), `dimension ${trait}`).toBe(5);
    }
  });

  test("ids are unique and sequential", () => {
    expect(ITEMS.map((i) => i.id)).toEqual(ITEMS.map((_, idx) => idx + 1));
  });

  test("items are activities, not job titles, and carry no free-text traps", () => {
    for (const item of ITEMS) {
      expect(item.text.length).toBeGreaterThan(10);
      expect(item.text.length).toBeLessThan(120); // must fit big type on a phone
    }
  });

  test("scale has five points", () => {
    expect(SCALE).toHaveLength(5);
    expect(MAX_ANSWER).toBe(4);
  });
});

describe("answersToTraits", () => {
  test("sums by dimension", () => {
    const answers = ITEMS.map((item) => (item.trait === "help" ? 4 : 1));
    const traits = answersToTraits(answers);
    expect(traits.help).toBe(20);
    expect(traits.build).toBe(5);
  });

  test("rejects wrong length", () => {
    expect(() => answersToTraits([1, 2, 3])).toThrow(/Expected 30 answers/);
  });

  test("rejects out-of-range and non-integer values", () => {
    const base = Array(30).fill(0);
    expect(() => answersToTraits([...base.slice(1), 5])).toThrow(/out of range/);
    expect(() => answersToTraits([...base.slice(1), -1])).toThrow(/out of range/);
    expect(() => answersToTraits([...base.slice(1), 2.5])).toThrow(/out of range/);
    expect(() => answersToTraits([...base.slice(1), "3"])).toThrow(/out of range/);
  });
});

describe("claim codes", () => {
  test("six chars from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = newClaimCode();
      expect(code).toHaveLength(CLAIM_CODE_LENGTH);
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTWXZ]+$/);
      // The confusables a kid could mis-copy never appear.
      expect(code).not.toMatch(/[01OILUVY]/);
    }
  });

  test("normalization forgives what humans type", () => {
    expect(normalizeClaimCode("  ab-c 2 3z ")).toBe("ABC23Z");
  });
});
