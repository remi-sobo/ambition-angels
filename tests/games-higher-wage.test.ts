import { describe, expect, test } from "vitest";
import {
  gapBandForStreak,
  pickPair,
  toPairCard,
  type PoolPlayRow,
} from "../lib/games/higher-wage";
import { signPairToken, verifyPairToken, type PairClaims } from "../lib/games/token";

const row = (soc: string, pay: number): PoolPlayRow => ({
  soc_code: soc,
  title: `Job ${soc}`,
  reveal_line: `Does the work of ${soc}`,
  pay_median: pay,
});

// A deterministic rng so pair picks are exact.
const seeded = (seed = 42) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

describe("gapBandForStreak", () => {
  test("starts wide and tightens monotonically", () => {
    const bands = [0, 5, 10, 15].map(gapBandForStreak);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].min).toBeLessThan(bands[i - 1].min);
      expect(bands[i].max).toBeLessThan(bands[i - 1].max);
    }
  });

  test("early band is bounded above — no insulting gaps", () => {
    expect(gapBandForStreak(0).max).toBeLessThanOrEqual(4.0);
  });
});

describe("pickPair", () => {
  const pool = [
    row("11-0001", 30000),
    row("11-0002", 48000), // 1.6x of 30k
    row("11-0003", 60000),
    row("11-0004", 90000), // 1.5x of 60k
    row("11-0005", 100000),
    row("11-0006", 110000), // 1.1x of 100k
  ];

  test("streak 0 pair lands inside the wide band", () => {
    const pair = pickPair(pool, 0, [], seeded())!;
    const r =
      Math.max(pair.a.pay_median, pair.b.pay_median) /
      Math.min(pair.a.pay_median, pair.b.pay_median);
    expect(r).toBeGreaterThanOrEqual(1.5);
    expect(r).toBeLessThanOrEqual(4.0);
  });

  test("excluded jobs are not dealt again", () => {
    const exclude = ["11-0001", "11-0002", "11-0003"];
    for (let seed = 1; seed <= 20; seed++) {
      const pair = pickPair(pool, 0, exclude, seeded(seed))!;
      expect(exclude).not.toContain(pair.a.soc_code);
      expect(exclude).not.toContain(pair.b.soc_code);
    }
  });

  test("exclusion releases rather than starving the deck", () => {
    const exclude = pool.map((r) => r.soc_code).slice(0, 5); // one row left
    const pair = pickPair(pool, 0, exclude, seeded());
    expect(pair).not.toBeNull();
  });

  test("falls back to the nearest real gap when the band is impossible", () => {
    const tightPool = [row("13-0001", 50000), row("13-0002", 51000)]; // ratio 1.02
    const pair = pickPair(tightPool, 0, [], seeded());
    expect(pair).not.toBeNull();
  });

  test("null when no two rows have distinct pay", () => {
    expect(pickPair([row("13-0001", 50000), row("13-0002", 50000)], 0, [], seeded())).toBeNull();
    expect(pickPair([row("13-0001", 50000)], 0, [], seeded())).toBeNull();
  });

  test("20 rounds with exclusion show 40 distinct occupations (DoD)", () => {
    const bigPool = Array.from({ length: 50 }, (_, i) =>
      row(`17-${String(1000 + i)}`, 30000 + i * 4000)
    );
    const seen: string[] = [];
    const rng = seeded(7);
    for (let round = 0; round < 20; round++) {
      const pair = pickPair(bigPool, round, seen, rng)!;
      seen.push(pair.a.soc_code, pair.b.soc_code);
    }
    expect(new Set(seen).size).toBe(40);
  });
});

describe("pre-tap response carries no pay (CI leak test from the spec)", () => {
  test("toPairCard drops every pay-shaped field and value", () => {
    const dealt = { ...row("29-2055", 60610), pay_p90: 90000, extra: "surprise" } as PoolPlayRow;
    const json = JSON.stringify(toPairCard(dealt));
    expect(json.toLowerCase()).not.toContain("pay");
    expect(json).not.toContain("60610");
    expect(json).not.toContain("90000");
    expect(Object.keys(toPairCard(dealt)).sort()).toEqual(["reveal", "soc", "title"]);
  });
});

describe("pair token", () => {
  const secret = "test-secret";
  const claims: PairClaims = { a: "29-2055", b: "47-2031", exp: Date.now() + 60000 };

  test("round-trips", () => {
    const token = signPairToken(claims, secret);
    expect(verifyPairToken(token, Date.now(), secret)).toEqual(claims);
  });

  test("tampered payload is rejected", () => {
    const token = signPairToken(claims, secret);
    const [payload, mac] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...claims, a: "11-1011" })
    ).toString("base64url");
    expect(verifyPairToken(`${forged}.${mac}`, Date.now(), secret)).toBeNull();
    expect(verifyPairToken(`${payload}.AAAA`, Date.now(), secret)).toBeNull();
  });

  test("wrong secret is rejected", () => {
    const token = signPairToken(claims, secret);
    expect(verifyPairToken(token, Date.now(), "other-secret")).toBeNull();
  });

  test("expired token is rejected", () => {
    const token = signPairToken({ ...claims, exp: Date.now() - 1 }, secret);
    expect(verifyPairToken(token, Date.now(), secret)).toBeNull();
  });

  test("garbage is rejected, not thrown", () => {
    expect(verifyPairToken("", Date.now(), secret)).toBeNull();
    expect(verifyPairToken("no-dot", Date.now(), secret)).toBeNull();
    expect(verifyPairToken("a.b.c", Date.now(), secret)).toBeNull();
  });
});
