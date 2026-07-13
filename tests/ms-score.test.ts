import { describe, expect, test } from "vitest";

import { pearson, rankCareers, type ScorableOccupation } from "../lib/ms/score";
import { traitsToRiasec, asRiasecProfile, type RiasecProfile } from "../lib/ms/riasec";

const profile = (r: number, i: number, a: number, s: number, e: number, c: number): RiasecProfile => ({
  R: r,
  I: i,
  A: a,
  S: s,
  E: e,
  C: c,
});

// A small synthetic catalog shaped like the eight launch occupations:
// dominant dimensions mirror what the O*NET profiles look like, job zones
// are the real ones. Values are fixtures, not imports.
const CATALOG: ScorableOccupation[] = [
  { socCode: "29-2055", riasec: profile(5.0, 3.0, 1.0, 4.5, 1.5, 4.5), jobZone: 3 }, // Surgical Technologist
  { socCode: "29-1141", riasec: profile(2.5, 4.0, 1.5, 5.5, 2.5, 3.5), jobZone: 4 }, // Registered Nurse
  { socCode: "15-1255", riasec: profile(1.0, 4.5, 4.0, 2.0, 2.5, 3.0), jobZone: 4 }, // UX Researcher
  { socCode: "15-1252", riasec: profile(3.0, 5.5, 2.0, 1.0, 2.0, 4.0), jobZone: 4 }, // Software Developer
  { socCode: "13-1081", riasec: profile(1.5, 3.5, 1.0, 1.5, 4.5, 5.5), jobZone: 4 }, // Supply Chain Analyst
  { socCode: "11-2021", riasec: profile(1.0, 3.0, 3.5, 2.5, 5.5, 3.0), jobZone: 4 }, // Marketing Manager
  { socCode: "27-1021", riasec: profile(4.0, 3.0, 5.5, 1.0, 2.5, 1.5), jobZone: 4 }, // Industrial Designer
  { socCode: "27-1024", riasec: profile(2.0, 1.5, 5.5, 1.5, 3.0, 2.5), jobZone: 4 }, // Graphic Designer
];

describe("pearson", () => {
  test("identical shape → 1", () => {
    const p = profile(1, 2, 3, 4, 5, 6);
    expect(pearson(p, p)).toBeCloseTo(1, 10);
  });

  test("same shape, different magnitude → 1 (matches shape, not size)", () => {
    expect(pearson(profile(1, 2, 3, 4, 5, 6), profile(2, 4, 6, 8, 10, 12))).toBeCloseTo(1, 10);
  });

  test("inverted shape → -1", () => {
    expect(pearson(profile(1, 2, 3, 4, 5, 6), profile(6, 5, 4, 3, 2, 1))).toBeCloseTo(-1, 10);
  });

  test("flat student profile → 0, not NaN", () => {
    expect(pearson(profile(3, 3, 3, 3, 3, 3), profile(1, 2, 3, 4, 5, 6))).toBe(0);
  });

  test("flat occupation profile → 0, not NaN", () => {
    expect(pearson(profile(1, 2, 3, 4, 5, 6), profile(2, 2, 2, 2, 2, 2))).toBe(0);
  });
});

describe("rankCareers — the D3 sanity gate, run in code instead of by hand", () => {
  test("the helper surfaces Surgical Tech or RN in the top two", () => {
    // A kid whose profile is dominated by Help (S), with some Organize.
    const helper = traitsToRiasec({ build: 1, analyze: 1, create: 0, help: 5, lead: 1, organize: 3 });
    const top = rankCareers(helper, CATALOG, { topN: 8 }).slice(0, 2).map((o) => o.socCode);
    expect(top).toContain("29-1141"); // RN is the strongest Help profile
    expect(["29-2055", "29-1141"]).toEqual(expect.arrayContaining([top[0]]));
  });

  test("the builder surfaces the maker jobs at the top", () => {
    const builder = traitsToRiasec({ build: 5, analyze: 3, create: 2, help: 0, lead: 0, organize: 1 });
    const top3 = rankCareers(builder, CATALOG, { topN: 8 }).slice(0, 3).map((o) => o.socCode);
    // Surgical tech (R-heavy), software dev (R+I), industrial designer (R+A).
    expect(top3).toContain("29-2055");
    expect(top3.some((s) => s === "15-1252" || s === "27-1021")).toBe(true);
  });

  test("the leader surfaces marketing manager first", () => {
    const leader = traitsToRiasec({ build: 0, analyze: 2, create: 2, help: 2, lead: 5, organize: 2 });
    const first = rankCareers(leader, CATALOG, { topN: 8 })[0];
    expect(first.socCode).toBe("11-2021");
  });

  test("deterministic: same input, same list, twice", () => {
    const kid = traitsToRiasec({ build: 2, analyze: 4, create: 1, help: 3, lead: 2, organize: 5 });
    const a = rankCareers(kid, CATALOG);
    const b = rankCareers(kid, [...CATALOG].reverse());
    expect(a).toEqual(b);
  });
});

describe("rankCareers — the Job Zone guarantee", () => {
  // A catalog where everything correlated with an Analyze kid needs a
  // bachelor's — except a few accessible trades further down the list.
  const DEGREE_HEAVY: ScorableOccupation[] = [
    ...Array.from({ length: 10 }, (_, i) => ({
      socCode: `15-90${String(i).padStart(2, "0")}`,
      riasec: profile(2, 5.5 - i * 0.05, 2, 1, 2, 4),
      jobZone: 4 as number,
    })),
    { socCode: "49-9021", riasec: profile(5.5, 3.5, 1, 1.5, 1.5, 3), jobZone: 3 }, // HVAC
    { socCode: "47-2111", riasec: profile(5.5, 3.0, 1, 1, 2, 3.5), jobZone: 3 }, // Electrician
    { socCode: "29-2055", riasec: profile(5.0, 3.0, 1, 4.5, 1.5, 4.5), jobZone: 3 }, // Surgical Tech
  ];

  test("every top ten holds at least three Job Zone 1-3 careers", () => {
    const analyzeKid = traitsToRiasec({ build: 1, analyze: 5, create: 2, help: 1, lead: 2, organize: 4 });
    const result = rankCareers(analyzeKid, DEGREE_HEAVY);
    expect(result).toHaveLength(10);
    const accessible = result.filter((o) => o.jobZone <= 3);
    expect(accessible.length).toBeGreaterThanOrEqual(3);
    // The promoted rows are flagged for telemetry, and eviction takes the
    // lowest-ranked degree jobs — the student's #1 match always survives.
    expect(result.filter((o) => o.promoted).length).toBeGreaterThan(0);
    const fullRanking = rankCareers(analyzeKid, DEGREE_HEAVY, { topN: DEGREE_HEAVY.length });
    expect(result[0].socCode).toBe(fullRanking[0].socCode);
  });

  test("list stays sorted by correlation after promotion — order never lies about fit", () => {
    const analyzeKid = traitsToRiasec({ build: 1, analyze: 5, create: 2, help: 1, lead: 2, organize: 4 });
    const result = rankCareers(analyzeKid, DEGREE_HEAVY);
    const scores = result.map((o) => o.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  test("a catalog without the spread cannot satisfy the guarantee and does not throw", () => {
    const allDegree = DEGREE_HEAVY.filter((o) => o.jobZone > 3);
    const kid = traitsToRiasec({ build: 1, analyze: 5, create: 2, help: 1, lead: 2, organize: 4 });
    const result = rankCareers(kid, allDegree);
    expect(result.filter((o) => o.jobZone <= 3)).toHaveLength(0);
    expect(result).toHaveLength(10);
  });

  test("flat student profile still gets a stable, accessible-inclusive list", () => {
    const flat = traitsToRiasec({ build: 3, analyze: 3, create: 3, help: 3, lead: 3, organize: 3 });
    const a = rankCareers(flat, DEGREE_HEAVY);
    const b = rankCareers(flat, [...DEGREE_HEAVY].reverse());
    expect(a).toEqual(b);
    // All correlations are 0; tie-break favors lower job zones first.
    expect(a[0].jobZone).toBeLessThanOrEqual(3);
  });
});

describe("asRiasecProfile", () => {
  test("accepts a well-formed jsonb payload", () => {
    expect(asRiasecProfile({ R: 1, I: 2, A: 3, S: 4, E: 5, C: 6 })).toEqual(profile(1, 2, 3, 4, 5, 6));
  });
  test("rejects a missing dimension", () => {
    expect(() => asRiasecProfile({ R: 1, I: 2, A: 3, S: 4, E: 5 })).toThrow(/missing numeric C/);
  });
  test("rejects a non-numeric dimension", () => {
    expect(() => asRiasecProfile({ R: 1, I: 2, A: 3, S: 4, E: 5, C: "6" })).toThrow(/missing numeric C/);
  });
});
