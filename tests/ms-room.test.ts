import { describe, expect, test } from "vitest";

import { assignTables, shuffle, type RoomStudent } from "../lib/ms/room";
import { newRoomCode, ROOM_CODE_LENGTH } from "../lib/ms/claim";
import { newHandle, HANDLE_SPACE } from "../lib/ms/handles";

// A deterministic rng for exact assertions.
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const student = (id: string, ranked: string[], explored: string[] = []): RoomStudent => ({
  sessionId: id,
  handle: `H-${id}`,
  ranked,
  explored,
});

describe("assignTables — D5: table dedup is a constraint, not a hope", () => {
  test("four students with identical rankings get four distinct careers", () => {
    const ranked = ["A", "B", "C", "D", "E"];
    const students = ["s1", "s2", "s3", "s4"].map((id) => student(id, ranked));
    const tables = assignTables(students, { rng: seededRng(7) });
    expect(tables).toHaveLength(1);
    const socs = tables[0].members.map((m) => m.socCode);
    expect(new Set(socs).size).toBe(4);
    // And everyone still got something off their own list.
    for (const soc of socs) expect(ranked).toContain(soc);
  });

  test("a solo-explored career is not dealt back to the same student", () => {
    const students = [
      student("fast", ["A", "B", "C"], ["A"]), // already saw A's answer while waiting
      student("s2", ["A", "B", "C"]),
    ];
    const tables = assignTables(students, { rng: seededRng(1) });
    const fast = tables[0].members.find((m) => m.sessionId === "fast")!;
    expect(fast.socCode).not.toBe("A");
  });

  test("23 students land in tables of 2-4 with no table of one", () => {
    const ranked = Array.from({ length: 12 }, (_, i) => `SOC-${i}`);
    const students = Array.from({ length: 23 }, (_, i) => student(`s${i}`, ranked));
    const tables = assignTables(students, { rng: seededRng(42) });
    const sizes = tables.map((t) => t.members.length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(23);
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(2);
      expect(size).toBeLessThanOrEqual(4);
    }
    // Dedup holds within every table.
    for (const t of tables) {
      const socs = t.members.map((m) => m.socCode);
      expect(new Set(socs).size).toBe(socs.length);
    }
  });

  test("dedup degrades softly when the catalog is smaller than the table", () => {
    const students = ["s1", "s2", "s3", "s4"].map((id) => student(id, ["A", "B"]));
    const tables = assignTables(students, { rng: seededRng(3) });
    // Everyone still gets a card; duplicates are unavoidable with 2 careers.
    for (const m of tables[0].members) expect(["A", "B"]).toContain(m.socCode);
  });

  test("deterministic given the rng", () => {
    const ranked = ["A", "B", "C", "D", "E", "F"];
    const students = Array.from({ length: 8 }, (_, i) => student(`s${i}`, ranked));
    expect(assignTables(students, { rng: seededRng(9) })).toEqual(
      assignTables(students, { rng: seededRng(9) })
    );
  });
});

describe("shuffle", () => {
  test("permutes without losing anyone", () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const out = shuffle(items, seededRng(5));
    expect([...out].sort()).toEqual([...items].sort());
  });
});

describe("room codes and handles", () => {
  test("room codes are four unambiguous characters", () => {
    for (let i = 0; i < 100; i++) {
      const code = newRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTWXZ]+$/);
    }
  });

  test("handles are two kid-safe words with real space to draw from", () => {
    expect(HANDLE_SPACE).toBeGreaterThanOrEqual(400);
    for (let i = 0; i < 50; i++) {
      expect(newHandle()).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    }
  });
});
