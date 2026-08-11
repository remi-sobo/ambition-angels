import { describe, expect, test } from "vitest";
import {
  BOARD_SIZE,
  RULES,
  STARTING_LIVES,
  newRoomState,
  currentRule,
  pickBoard,
  quorumNeeded,
  resolveRound,
  standing,
  toPublicState,
  type CutCareer,
} from "../lib/games/the-cut";

const seeded = (seed = 42) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

const career = (soc: string, over: Partial<CutCareer> = {}): CutCareer => ({
  soc_code: soc,
  title: `Job ${soc}`,
  reveal_line: `Does the work of ${soc}`,
  pay_median: 50000,
  pay_p90: 80000,
  job_zone: 3,
  education_typical: "High school diploma",
  riasec: { R: 3, I: 3, A: 3, S: 3, E: 3, C: 3 },
  field: "health",
  day_vignette: null,
  ...over,
});

const board = [
  career("11-0001", { pay_median: 30000, pay_p90: 40000, job_zone: 1, riasec: { R: 6, I: 1, A: 1, S: 1, E: 1, C: 1 } }),
  career("11-0002", { pay_median: 45000, pay_p90: 60000, job_zone: 2, riasec: { R: 1, I: 6, A: 1, S: 1, E: 1, C: 1 } }),
  career("11-0003", { pay_median: 55000, pay_p90: 90000, job_zone: 3, riasec: { R: 1, I: 1, A: 6, S: 1, E: 1, C: 1 } }),
  career("11-0004", { pay_median: 65000, pay_p90: 120000, job_zone: 4, riasec: { R: 1, I: 1, A: 1, S: 6, E: 1, C: 1 } }),
  career("11-0005", { pay_median: 80000, pay_p90: 200000, job_zone: 5, riasec: { R: 1, I: 1, A: 1, S: 1, E: 6, C: 1 } }),
  career("11-0006", { pay_median: 95000, pay_p90: 110000, job_zone: 5, riasec: { R: 1, I: 1, A: 1, S: 1, E: 1, C: 6 } }),
];

describe("rule deck", () => {
  test("has exactly twelve rules with unique ids", () => {
    expect(RULES).toHaveLength(12);
    expect(new Set(RULES.map((r) => r.id)).size).toBe(12);
  });

  test("every rule picks deterministically with the soc tiebreak", () => {
    const tied = [career("13-0002"), career("13-0001"), career("13-0003")];
    for (const rule of RULES) {
      // All stats equal → every rule must fall back to lowest soc code.
      expect(rule.pick(tied).soc_code).toBe("13-0001");
    }
  });

  test("pay and preparation rules pick the right career", () => {
    const byId = new Map(RULES.map((r) => [r.id, r]));
    expect(byId.get("lowest_pay")!.pick(board).soc_code).toBe("11-0001");
    expect(byId.get("highest_pay")!.pick(board).soc_code).toBe("11-0006");
    expect(byId.get("most_school")!.pick(board).soc_code).toBe("11-0005"); // zone 5 tie → lower soc
    expect(byId.get("least_school")!.pick(board).soc_code).toBe("11-0001");
    expect(byId.get("top_end")!.pick(board).soc_code).toBe("11-0005");
    expect(byId.get("most_hands_on")!.pick(board).soc_code).toBe("11-0001");
    expect(byId.get("most_creative")!.pick(board).soc_code).toBe("11-0003");
  });
});

describe("room lifecycle", () => {
  test("a full game plays six careers down to one survivor in five rounds", () => {
    let state = newRoomState(board, seeded(7));
    expect(state.deck).toHaveLength(5);
    expect(new Set(state.deck).size).toBe(5); // no repeated rule in a room

    for (let round = 0; round < 5; round++) {
      expect(state.phase).toBe("vote");
      const rule = currentRule(state)!;
      expect(rule.text.toLowerCase()).toContain("cut");
      state = resolveRound(state, {});
    }
    expect(state.phase).toBe("done");
    expect(standing(state)).toHaveLength(1);
    expect(state.history).toHaveLength(5);
  });

  test("a right plurality keeps lives; wrong or silent rounds cost one", () => {
    const state = newRoomState(board, seeded(7));
    const rule = RULES.find((r) => r.id === state.deck[0])!;
    const correct = rule.pick(standing(state)).soc_code;
    const wrong = standing(state).find((c) => c.soc_code !== correct)!.soc_code;

    const right = resolveRound(state, { [correct]: 10, [wrong]: 3 });
    expect(right.lives).toBe(STARTING_LIVES);
    expect(right.history[0].roomRight).toBe(true);

    const lost = resolveRound(state, { [correct]: 3, [wrong]: 10 });
    expect(lost.lives).toBe(STARTING_LIVES - 1);

    const silent = resolveRound(state, {});
    expect(silent.lives).toBe(STARTING_LIVES - 1);
  });

  test("an exact tie that includes the answer is not a loss", () => {
    const state = newRoomState(board, seeded(7));
    const rule = RULES.find((r) => r.id === state.deck[0])!;
    const correct = rule.pick(standing(state)).soc_code;
    const other = standing(state).find((c) => c.soc_code !== correct)!.soc_code;
    const tied = resolveRound(state, { [correct]: 5, [other]: 5 });
    expect(tied.lives).toBe(STARTING_LIVES);
  });

  test("lives never go below zero and the board still finishes", () => {
    let state = newRoomState(board, seeded(7));
    for (let i = 0; i < 5; i++) state = resolveRound(state, { "99-9999": 1 });
    expect(state.lives).toBe(0);
    expect(state.phase).toBe("done");
  });
});

describe("board building", () => {
  test("prefers a single field that can fill a board", () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => career(`21-${1000 + i}`, { field: "public" })),
      ...Array.from({ length: 3 }, (_, i) => career(`15-${1000 + i}`, { field: "tech" })),
    ];
    const picked = pickBoard(rows, seeded(3))!;
    expect(picked).toHaveLength(BOARD_SIZE);
    expect(new Set(picked.map((c) => c.field))).toEqual(new Set(["public"]));
  });

  test("falls back to a mixed board when no field can", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      career(`21-${1000 + i}`, { field: i % 4 === 0 ? "tech" : null })
    );
    expect(pickBoard(rows, seeded(3))).toHaveLength(BOARD_SIZE);
  });

  test("null when the pool cannot seat a board", () => {
    expect(pickBoard([career("21-1000")], seeded(3))).toBeNull();
  });
});

describe("quorum", () => {
  test("most of the room, never zero", () => {
    expect(quorumNeeded(0)).toBe(1);
    expect(quorumNeeded(1)).toBe(1);
    expect(quorumNeeded(25)).toBe(15);
  });
});

describe("public state carries no answers (leak boundary)", () => {
  test("standing careers expose no stats mid-game", () => {
    let state = newRoomState(board, seeded(7));
    state = resolveRound(state, {}); // one career cut, five standing
    const json = JSON.stringify(toPublicState(state));
    // The stats the rules quiz on must not appear for standing careers.
    expect(json).not.toMatch(/pay_median|pay_p90|job_zone|riasec|education/);
    // The explain line for the already-cut career is allowed (it's the reveal).
    expect(toPublicState(state).history).toHaveLength(1);
  });

  test("done unlocks exactly the survivor's numbers", () => {
    let state = newRoomState(board, seeded(7));
    for (let i = 0; i < 5; i++) state = resolveRound(state, {});
    const pub = toPublicState(state);
    expect(pub.phase).toBe("done");
    expect(pub.survivor).not.toBeNull();
    expect(pub.survivor!.pay_median).toBeGreaterThan(0);
  });

  test("no student-facing text says 'wrong' (DoD: never pointed at a kid)", () => {
    let state = newRoomState(board, seeded(7));
    state = resolveRound(state, { "99-9999": 1 });
    expect(JSON.stringify(toPublicState(state)).toLowerCase()).not.toContain('"wrong"');
    for (const rule of RULES) {
      expect(rule.text.toLowerCase()).not.toContain("wrong");
    }
  });
});
