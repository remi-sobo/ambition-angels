import { describe, expect, test } from "vitest";
import {
  laDateString,
  dayNumber,
  normalizeAnswer,
  canonicalAnswer,
  DAILY_EPOCH,
} from "../lib/games/guess";
import {
  acceptedHashes,
  hashAnswer,
  lowZoneViolation,
} from "../lib/games/daily";

describe("day math rolls at midnight Pacific, not UTC (Phase 4 DoD)", () => {
  test("06:59 UTC is still yesterday in LA; 07:01 UTC is today (PDT)", () => {
    expect(laDateString(new Date("2026-08-11T06:59:00Z"))).toBe("2026-08-10");
    expect(laDateString(new Date("2026-08-11T07:01:00Z"))).toBe("2026-08-11");
  });

  test("winter (PST, UTC-8) rolls at 08:00 UTC", () => {
    expect(laDateString(new Date("2026-01-15T07:59:00Z"))).toBe("2026-01-14");
    expect(laDateString(new Date("2026-01-15T08:01:00Z"))).toBe("2026-01-15");
  });

  test("two devices at the same instant compute the same day regardless of locale", () => {
    const instant = new Date("2026-08-11T23:30:00Z");
    expect(laDateString(instant)).toBe(laDateString(new Date(instant.getTime())));
  });

  test("day numbers count from the epoch", () => {
    expect(dayNumber(DAILY_EPOCH)).toBe(0);
    expect(dayNumber("2026-08-11")).toBe(1);
    expect(dayNumber("2026-09-10")).toBe(31);
  });
});

describe("guess matching", () => {
  test("normalization strips case, punctuation, and spacing", () => {
    expect(normalizeAnswer("  Sur-gical   Technologists! ")).toBe("surgicaltechnologists");
  });

  test("canonical form drops one trailing s, but not ss", () => {
    expect(canonicalAnswer("Surgical Technologists")).toBe("surgicaltechnologist");
    expect(canonicalAnswer("surgical technologist")).toBe("surgicaltechnologist");
    expect(canonicalAnswer("EMTs")).toBe("emt");
    expect(canonicalAnswer("EMT")).toBe("emt");
    expect(canonicalAnswer("Boss")).toBe("boss");
  });

  test("a plausible variant matches through the hash set (the EMT case)", () => {
    const hashes = acceptedHashes("Emergency Medical Technicians", ["EMT", "Ambulance Technician"]);
    expect(hashes).toContain(hashAnswer(canonicalAnswer("emt")));
    expect(hashes).toContain(hashAnswer(canonicalAnswer("E.M.T.s")));
    expect(hashes).toContain(hashAnswer(canonicalAnswer("emergency medical technician")));
    expect(hashes).not.toContain(hashAnswer(canonicalAnswer("paramedic")));
  });

  test("the title itself never appears in the hash set output", () => {
    const hashes = acceptedHashes("Radiologic Technologists", []);
    expect(JSON.stringify(hashes)).not.toMatch(/radiolog/i);
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("3-of-7 low-zone scheduling rule", () => {
  const week = (zones: number[], start = "2026-09-01") => {
    const m = new Map<string, number>();
    zones.forEach((z, i) =>
      m.set(new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10), z)
    );
    return m;
  };

  test("a compliant full week passes", () => {
    expect(lowZoneViolation(week([1, 2, 3, 4, 5, 2, 5]), "2026-09-04")).toBeNull();
  });

  test("a full week with only two low-zone days is flagged", () => {
    const v = lowZoneViolation(week([4, 4, 2, 4, 5, 3, 5]), "2026-09-04");
    expect(v).not.toBeNull();
    expect(v!.lowCount).toBe(2);
  });

  test("incomplete windows are not judged", () => {
    const partial = week([5, 5], "2026-09-01"); // only two days scheduled
    expect(lowZoneViolation(partial, "2026-09-02")).toBeNull();
  });
});
