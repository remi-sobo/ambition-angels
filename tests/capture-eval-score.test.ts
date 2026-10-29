import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DOD_MIN_CORRECT,
  MIN_SIMILARITY,
  pairNotes,
  scoreDod,
  scoreNote,
  similarity,
  type AnswerKey,
  type ExportCapture,
  type ExportCard,
  type KeyNote,
} from "@/lib/capture/evalScore";

// The V1 matcher bar as code. Fictional names and ids only; the real key and
// recordings never enter git.

const card = (over: Partial<ExportCard>): ExportCard => ({
  dest: "interaction",
  status: "proposed",
  entity_type: null,
  entity_id: null,
  heard_name: null,
  match_candidates: [],
  ...over,
});
const cap = (id: string, transcript: string, cards: ExportCard[], at = "2026-10-18T17:00:00Z"): ExportCapture => ({
  id,
  created_at: at,
  transcript,
  cards,
});

const PRIYA = "p-1";
const PRIYA_DUP_A = "d-1";
const PRIYA_DUP_B = "d-2";
const STAFF_NAMESAKE = "s-1";

const recordNote: KeyNote = {
  n: 1,
  script: "Coffee with Priya Natarajan, she wants the impact numbers.",
  expect: [{ label: "Priya Natarajan", dest: "interaction", match: "record", ids: [PRIYA] }],
};
const holdNote: KeyNote = {
  n: 2,
  script: "Lunch with Avery Quill, she wants to volunteer this summer.",
  expect: [{ label: "Avery Quill (two records)", match: "hold", ids: [PRIYA_DUP_A, PRIYA_DUP_B] }],
};
const noneNote: KeyNote = {
  n: 3,
  script: "Heard the Cedar Grove Trust opens applications in January, look into it.",
  expect: [{ label: "prospect only", dest: "thought", match: "none" }],
};

describe("scoreNote", () => {
  test("record: the right pick, or a hold offering it, is correct", () => {
    expect(scoreNote(recordNote, cap("c1", recordNote.script, [card({ entity_type: "constituent", entity_id: PRIYA })])).outcome).toBe("correct");
    const held = card({ status: "held", match_candidates: [{ id: PRIYA }, { id: "x" }] });
    expect(scoreNote(recordNote, cap("c1", recordNote.script, [held])).outcome).toBe("correct");
  });

  test("record: a filing to someone else is WRONG", () => {
    const r = scoreNote(recordNote, cap("c1", recordNote.script, [card({ entity_id: "someone-else" })]));
    expect(r.outcome).toBe("wrong");
    expect(r.wrongFilings).toEqual(["someone-else"]);
  });

  test("record: a near duplicate is a miss, not wrong; nothing at all is a miss", () => {
    const near: KeyNote = { ...recordNote, expect: [{ label: "Priya", match: "record", ids: [PRIYA], near: ["p-2"] }] };
    expect(scoreNote(near, cap("c1", near.script, [card({ entity_id: "p-2" })])).outcome).toBe("miss");
    expect(scoreNote(recordNote, cap("c1", recordNote.script, [card({ dest: "thought" })])).outcome).toBe("miss");
  });

  test("hold: asking is correct, auto-picking one of the duplicates is a miss", () => {
    const held = card({ status: "held", match_candidates: [{ id: PRIYA_DUP_A }, { id: PRIYA_DUP_B }] });
    expect(scoreNote(holdNote, cap("c2", holdNote.script, [held])).outcome).toBe("correct");
    expect(scoreNote(holdNote, cap("c2", holdNote.script, [card({ entity_id: PRIYA_DUP_A })])).outcome).toBe("miss");
  });

  test("none: any filing is wrong; a thought with no record is correct", () => {
    expect(scoreNote(noneNote, cap("c3", noneNote.script, [card({ dest: "thought" })])).outcome).toBe("correct");
    expect(scoreNote(noneNote, cap("c3", noneNote.script, [card({ entity_id: "anyone" })])).outcome).toBe("wrong");
  });

  test("forbid: a donor who shares a staff member's first name must not receive the task", () => {
    const note: KeyNote = {
      n: 4,
      script: "Coffee with Priya Natarajan. Have Jordan send her the one-pager.",
      expect: [{ label: "Priya", match: "record", ids: [PRIYA, STAFF_NAMESAKE] }],
      forbid: [STAFF_NAMESAKE],
    };
    const r = scoreNote(note, cap("c4", note.script, [card({ entity_id: PRIYA }), card({ dest: "task", entity_id: STAFF_NAMESAKE })]));
    expect(r.outcome).toBe("wrong");
  });

  test("a held card is never a filing", () => {
    const r = scoreNote(noneNote, cap("c3", noneNote.script, [card({ status: "held", match_candidates: [{ id: "x" }] })]));
    expect(r.outcome).toBe("correct");
  });

  test("a discarded card is scored by what the matcher proposed", () => {
    // A pick that was discarded is still the matcher's pick.
    expect(scoreNote(recordNote, cap("c1", recordNote.script, [card({ status: "discarded", entity_id: PRIYA })])).outcome).toBe("correct");
    expect(scoreNote(noneNote, cap("c3", noneNote.script, [card({ status: "discarded", entity_id: "x" })])).outcome).toBe("wrong");
    // A hold that was discarded is still a hold.
    const discardedHold = card({ status: "discarded", match_candidates: [{ id: PRIYA_DUP_A }, { id: PRIYA_DUP_B }] });
    expect(scoreNote(holdNote, cap("c2", holdNote.script, [discardedHold])).outcome).toBe("correct");
  });

  test("an unrecorded note is a miss", () => {
    expect(scoreNote(recordNote, null).outcome).toBe("miss");
  });
});

describe("pairing recordings to notes", () => {
  test("similarity is word overlap", () => {
    expect(similarity("Coffee with Priya", "coffee with priya")).toBe(1);
    expect(similarity("alpha beta gamma", "delta epsilon")).toBe(0);
  });

  test("speech-to-text drift still pairs; unrelated recordings don't; a re-recording wins", () => {
    const first = cap("old", "coffee with priya natara jan she wants the impact numbers", [], "2026-10-18T17:00:00Z");
    const redo = cap("new", "coffee with priya natarajan she wants the impact numbers", [], "2026-10-18T17:05:00Z");
    const other = cap("x", "book the venue for the board retreat", []);
    const pairs = pairNotes([recordNote], [first, redo, other]);
    expect(pairs.get(1)?.capture.id).toBe("new");
    expect(similarity(recordNote.script, other.transcript ?? "")).toBeLessThan(MIN_SIMILARITY);
  });

  test("each recording pairs with one note only", () => {
    const pairs = pairNotes([recordNote, { ...recordNote, n: 9 }], [cap("only", recordNote.script, [])]);
    expect(pairs.size).toBe(1);
  });
});

describe("scoreDod: 18 of 20 and zero wrong", () => {
  const notes = (n: number): KeyNote[] =>
    Array.from({ length: n }, (_, i) => ({
      n: i + 1,
      script: `note number ${i + 1} about donor alpha${i + 1} and the spring gala table ${i + 1}`,
      expect: [{ label: `alpha${i + 1}`, match: "record" as const, ids: [`id-${i + 1}`] }],
    }));
  const key: AnswerKey = { version: 1, notes: notes(20) };
  const rec = (i: number, entity: string | null) => cap(`c${i}`, key.notes[i - 1].script, [card({ entity_id: entity })]);

  test("18 right and 2 misses passes", () => {
    const caps = key.notes.map((n) => rec(n.n, n.n <= DOD_MIN_CORRECT ? `id-${n.n}` : null));
    const r = scoreDod(key, caps);
    expect([r.correct, r.miss, r.wrong, r.pass]).toEqual([18, 2, 0, true]);
  });

  test("17 right fails", () => {
    const caps = key.notes.map((n) => rec(n.n, n.n <= 17 ? `id-${n.n}` : null));
    expect(scoreDod(key, caps).pass).toBe(false);
  });

  test("19 right and one wrong filing fails", () => {
    const caps = key.notes.map((n) => rec(n.n, n.n <= 19 ? `id-${n.n}` : "id-1"));
    const r = scoreDod(key, caps);
    expect([r.correct, r.wrong, r.pass]).toEqual([19, 1, false]);
  });

  test("unrecorded notes count as misses and are reported", () => {
    const r = scoreDod(key, key.notes.slice(0, 15).map((n) => rec(n.n, `id-${n.n}`)));
    expect([r.correct, r.unrecorded, r.pass]).toEqual([15, 5, false]);
  });
});

describe("the real key and recordings stay out of git", () => {
  test("tests/fixtures/capture/private/ is gitignored", () => {
    expect(readFileSync(join(process.cwd(), ".gitignore"), "utf8")).toMatch(/^tests\/fixtures\/capture\/private\/$/m);
  });

  test("the export query is read-only and scoped by time", async () => {
    const { exportSql } = await import("@/scripts/capture-dod");
    const sql = exportSql("2026-10-18T00:00:00Z").toLowerCase();
    expect(sql).toMatch(/^select /);
    expect(sql).not.toMatch(/insert|update|delete|drop|alter/);
    expect(sql).toContain("where c.created_at >= '2026-10-18t00:00:00z'");
    expect(() => exportSql("1; drop table x")).toThrow();
  });
});
