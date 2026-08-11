/**
 * The Cut engine (specs/teen-games-v1.md Phase 5).
 *
 * Six careers on a projector, a rule dealt each round, the class votes on
 * which career the rule cuts. Every rule is computed from a column that
 * already exists — pay, job zone, RIASEC — with a stable tiebreak (lowest
 * SOC code), so a board resolves the same way every time and no model is
 * anywhere near it (locked decision 3). The board is snapshotted into the
 * room at creation; these functions only ever read that snapshot.
 *
 * The serializer at the bottom is the leak boundary: un-cut careers never
 * expose the stats the rules are quizzing on, because a kid with DevTools
 * open is a kid playing with extra steps only if the answer isn't sitting
 * in the response body.
 */

import { shuffle } from "@/lib/ms/room";

export type CutCareer = {
  soc_code: string;
  title: string;
  reveal_line: string;
  pay_median: number;
  pay_p90: number | null;
  job_zone: number;
  education_typical: string | null;
  riasec: Record<string, number>;
  /** Approved-card extras for the survivor screen, when they exist. */
  field: string | null;
  day_vignette: string | null;
};

export type RoomState = {
  careers: CutCareer[];
  /** Rule ids in deal order; round r uses deck[r]. */
  deck: string[];
  /** SOC codes cut so far, in round order. */
  cuts: string[];
  lives: number;
  round: number;
  /** "vote" while a round is open; "done" when one career remains. */
  phase: "vote" | "done";
  /** Per-round history the projector can replay: what got cut and why. */
  history: { round: number; ruleId: string; cutSoc: string; explain: string; roomRight: boolean; tally: Record<string, number> }[];
};

export const STARTING_LIVES = 3;
export const BOARD_SIZE = 6;
/** Votes required before resolve unlocks: most of the room, not all of it —
 *  a dead phone must not hold a class hostage. Host force overrides. */
export const QUORUM_RATIO = 0.6;

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

type RuleDef = {
  id: string;
  /** What the projector reads out when the rule is dealt. */
  text: string;
  /** Deterministic pick among still-standing careers. */
  pick: (standing: CutCareer[]) => CutCareer;
  /** One line justifying the cut, shown after the tally. */
  explain: (cut: CutCareer) => string;
};

/** min/max with the stable tiebreak: lowest soc_code wins ties. */
const extreme = (
  standing: CutCareer[],
  value: (c: CutCareer) => number,
  dir: "max" | "min"
): CutCareer =>
  [...standing].sort(
    (x, y) =>
      (dir === "max" ? value(y) - value(x) : value(x) - value(y)) ||
      x.soc_code.localeCompare(y.soc_code)
  )[0];

const p90Ratio = (c: CutCareer) => (c.pay_p90 ? c.pay_p90 / c.pay_median : 1);
const letter = (c: CutCareer, k: string) => c.riasec[k] ?? 0;

/**
 * The fixed deck of twelve (spec architecture sketch). Ids are stored in
 * room state, so renaming one is a migration of live rooms — don't.
 */
export const RULES: RuleDef[] = [
  {
    id: "lowest_pay",
    text: "Cut the job with the lowest typical pay",
    pick: (s) => extreme(s, (c) => c.pay_median, "min"),
    explain: (c) => `${c.title}: ${fmtUsd(c.pay_median)} median — the lowest on the board.`,
  },
  {
    id: "highest_pay",
    text: "Cut the job with the highest typical pay",
    pick: (s) => extreme(s, (c) => c.pay_median, "max"),
    explain: (c) => `${c.title}: ${fmtUsd(c.pay_median)} median — the highest on the board.`,
  },
  {
    id: "most_school",
    text: "Cut the job that takes the most preparation to enter",
    pick: (s) => extreme(s, (c) => c.job_zone, "max"),
    explain: (c) =>
      `${c.title}: job zone ${c.job_zone}${c.education_typical ? ` — typically ${c.education_typical.toLowerCase()}` : ""}.`,
  },
  {
    id: "least_school",
    text: "Cut the job you can start with the least preparation",
    pick: (s) => extreme(s, (c) => c.job_zone, "min"),
    explain: (c) =>
      `${c.title}: job zone ${c.job_zone}${c.education_typical ? ` — typically ${c.education_typical.toLowerCase()}` : ""}.`,
  },
  {
    id: "top_end",
    text: "Cut the job with the biggest best-case paycheck",
    pick: (s) => extreme(s, (c) => c.pay_p90 ?? 0, "max"),
    explain: (c) => `${c.title}: top earners make ${fmtUsd(c.pay_p90 ?? c.pay_median)}.`,
  },
  {
    id: "ceiling_gap",
    text: "Cut the job where pay grows the most from typical to top",
    pick: (s) => extreme(s, p90Ratio, "max"),
    explain: (c) =>
      `${c.title}: ${fmtUsd(c.pay_median)} typical, ${fmtUsd(c.pay_p90 ?? c.pay_median)} at the top.`,
  },
  {
    id: "flat_ceiling",
    text: "Cut the job where pay grows the least from typical to top",
    pick: (s) => extreme(s, p90Ratio, "min"),
    explain: (c) =>
      `${c.title}: ${fmtUsd(c.pay_median)} typical, ${fmtUsd(c.pay_p90 ?? c.pay_median)} at the top.`,
  },
  {
    id: "most_hands_on",
    text: "Cut the most hands-on, build-and-fix job",
    pick: (s) => extreme(s, (c) => letter(c, "R"), "max"),
    explain: (c) => `${c.title}: the strongest build-and-fix profile on the board.`,
  },
  {
    id: "most_people",
    text: "Cut the job that is most about helping people",
    pick: (s) => extreme(s, (c) => letter(c, "S"), "max"),
    explain: (c) => `${c.title}: the strongest helping profile on the board.`,
  },
  {
    id: "most_creative",
    text: "Cut the most creative job",
    pick: (s) => extreme(s, (c) => letter(c, "A"), "max"),
    explain: (c) => `${c.title}: the strongest creative profile on the board.`,
  },
  {
    id: "most_analytical",
    text: "Cut the job that is most about figuring things out",
    pick: (s) => extreme(s, (c) => letter(c, "I"), "max"),
    explain: (c) => `${c.title}: the strongest analytical profile on the board.`,
  },
  {
    id: "most_organized",
    text: "Cut the job that is most about keeping things exact and organized",
    pick: (s) => extreme(s, (c) => letter(c, "C"), "max"),
    explain: (c) => `${c.title}: the strongest precision-and-order profile on the board.`,
  },
];

const ruleById = new Map(RULES.map((r) => [r.id, r]));

export function newRoomState(careers: CutCareer[], rng: () => number = Math.random): RoomState {
  if (careers.length !== BOARD_SIZE) throw new Error(`Board needs exactly ${BOARD_SIZE} careers`);
  return {
    careers,
    deck: shuffle(RULES, rng).slice(0, BOARD_SIZE - 1).map((r) => r.id),
    cuts: [],
    lives: STARTING_LIVES,
    round: 0,
    phase: "vote",
    history: [],
  };
}

export const standing = (state: RoomState): CutCareer[] =>
  state.careers.filter((c) => !state.cuts.includes(c.soc_code));

export const currentRule = (state: RoomState): { id: string; text: string } | null => {
  if (state.phase !== "vote") return null;
  const rule = ruleById.get(state.deck[state.round]);
  return rule ? { id: rule.id, text: rule.text } : null;
};

export function quorumNeeded(joined: number): number {
  return Math.max(1, Math.ceil(joined * QUORUM_RATIO));
}

/**
 * Resolve the open round against the snapshot. The room is "right" when
 * the correct career is among the top vote-getters (an exact tie is not a
 * loss — the reveal still lands, and nobody gets told they sank the room
 * on a coin flip). Wrong costs one shared life, floor zero; the board
 * always plays to a survivor either way, because a classroom round that
 * ends with "you all lose, sit down" is a game a facilitator runs once.
 */
export function resolveRound(
  state: RoomState,
  tally: Record<string, number>
): RoomState {
  if (state.phase !== "vote") return state;
  const rule = ruleById.get(state.deck[state.round]);
  if (!rule) throw new Error(`Unknown rule ${state.deck[state.round]}`);

  const stand = standing(state);
  const cut = rule.pick(stand);

  const top = Math.max(0, ...stand.map((c) => tally[c.soc_code] ?? 0));
  const roomRight = top > 0 && (tally[cut.soc_code] ?? 0) === top;

  const cuts = [...state.cuts, cut.soc_code];
  const next: RoomState = {
    ...state,
    cuts,
    lives: roomRight ? state.lives : Math.max(0, state.lives - 1),
    round: state.round + 1,
    phase: state.careers.length - cuts.length <= 1 ? "done" : "vote",
    history: [
      ...state.history,
      {
        round: state.round,
        ruleId: rule.id,
        cutSoc: cut.soc_code,
        explain: rule.explain(cut),
        roomRight,
        tally,
      },
    ],
  };
  return next;
}

// ── Board building ────────────────────────────────────────────────────────

/**
 * Six from one field when a field can carry a board, else six from the
 * whole pool (spec wants field-pure boards; with a young pool a mixed
 * board beats no board). Deterministic given the rng.
 */
export function pickBoard(rows: CutCareer[], rng: () => number = Math.random): CutCareer[] | null {
  if (rows.length < BOARD_SIZE) return null;
  const byField = new Map<string, CutCareer[]>();
  for (const r of rows) {
    if (r.field) byField.set(r.field, [...(byField.get(r.field) ?? []), r]);
  }
  const fullFields = Array.from(byField.values()).filter((list) => list.length >= BOARD_SIZE);
  const source: CutCareer[] = fullFields.length
    ? fullFields[Math.floor(rng() * fullFields.length)]
    : rows;
  return shuffle(source, rng).slice(0, BOARD_SIZE);
}

// ── Public serialization (the leak boundary) ──────────────────────────────

export type PublicCareer = {
  soc: string;
  title: string;
  reveal: string;
  cut: boolean;
  cutRound: number | null;
};

export type PublicState = {
  round: number;
  phase: RoomState["phase"];
  lives: number;
  rule: { id: string; text: string } | null;
  careers: PublicCareer[];
  history: RoomState["history"];
  survivor: {
    soc: string;
    title: string;
    reveal: string;
    pay_median: number;
    pay_p90: number | null;
    education: string | null;
    vignette: string | null;
  } | null;
};

/**
 * What any phone or projector may see. Stats stay out of the body for
 * every career still standing — the history rows carry the explain lines
 * for careers already cut, and only "done" unlocks the survivor's full
 * numbers. tests/games-the-cut.test.ts asserts the absence.
 */
export function toPublicState(state: RoomState): PublicState {
  const survivorRow = state.phase === "done" ? standing(state)[0] ?? null : null;
  return {
    round: state.round,
    phase: state.phase,
    lives: state.lives,
    rule: currentRule(state),
    careers: state.careers.map((c) => ({
      soc: c.soc_code,
      title: c.title,
      reveal: c.reveal_line,
      cut: state.cuts.includes(c.soc_code),
      cutRound: state.cuts.indexOf(c.soc_code) === -1 ? null : state.cuts.indexOf(c.soc_code),
    })),
    history: state.history,
    survivor: survivorRow
      ? {
          soc: survivorRow.soc_code,
          title: survivorRow.title,
          reveal: survivorRow.reveal_line,
          pay_median: survivorRow.pay_median,
          pay_p90: survivorRow.pay_p90,
          education: survivorRow.education_typical,
          vignette: survivorRow.day_vignette,
        }
      : null,
  };
}
