/**
 * The V1 matcher bar, as code (specs/bloomos-capture.md, Definition of done):
 * "On a test set of 20 real-style notes, the matcher picks the right record or
 * correctly holds for a pick on at least 18, and files to a wrong record on
 * zero."
 *
 * Pure. Scores real recordings (captures + their cards, exported read-only
 * from production) against an answer key. The key and the export name real
 * donors, so they never live in git: scripts/capture-dod.ts reads them from
 * paths you pass (tests/fixtures/capture/private/ is gitignored for this).
 *
 * Per expected mention:
 *   record  the right record was picked, or the card held for a pick with it
 *           among the candidates -> correct. Picking a "near" record (a
 *           plausible same-person duplicate) -> miss, not wrong.
 *   hold    the name is genuinely ambiguous (exact duplicates, a bare family
 *           name): a held card offering any listed record -> correct;
 *           auto-picking one of them -> miss (a coin flip is not a match).
 *   none    nothing should be filed to a record (a prospect, a student, no
 *           names).
 * Any card filed to a record outside every expectation's allowed set (or to a
 * forbidden record) makes the note WRONG. That is the zero-tolerance half.
 */

export const DOD_TOTAL = 20;
export const DOD_MIN_CORRECT = 18;
export const DOD_MAX_WRONG = 0;

export type Expectation =
  | { label: string; dest?: string; match: "record"; ids: string[]; near?: string[] }
  | { label: string; dest?: string; match: "hold"; ids: string[] }
  | { label: string; dest?: string; match: "none" };

export type KeyNote = {
  n: number;
  script: string;
  /** Where to record it: "plus" (the ＋ menu) or a record page, for context notes. */
  how?: string;
  expect: Expectation[];
  /** Records that must never receive a filing from this note (e.g. a donor who shares a staff member's first name). */
  forbid?: string[];
  /** The note names a student. Documentation only: a student matched to a namesake is a filing outside the allowed set, so the note scores wrong. */
  youth?: boolean;
};

export type AnswerKey = { version: 1; notes: KeyNote[] };

export type ExportCard = {
  dest: string;
  status: "proposed" | "held" | "confirmed" | "discarded";
  entity_type: string | null;
  entity_id: string | null;
  heard_name: string | null;
  match_candidates: { id: string; kind?: string; name?: string }[] | null;
};

export type ExportCapture = {
  id: string;
  created_at: string;
  source_surface?: string | null;
  context_id?: string | null;
  transcript: string | null;
  cards: ExportCard[];
};

export type Outcome = "correct" | "miss" | "wrong";

export type NoteResult = {
  n: number;
  captureId: string | null;
  similarity: number;
  outcome: Outcome;
  rows: { label: string; outcome: Outcome | "missing"; detail: string; destOk: boolean | null }[];
  wrongFilings: string[];
};

export type DodReport = {
  results: NoteResult[];
  correct: number;
  miss: number;
  wrong: number;
  unrecorded: number;
  pass: boolean;
};

const words = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

/** Word-set overlap between a script and a transcript, 0..1 (Jaccard). */
export function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of Array.from(A)) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

export const MIN_SIMILARITY = 0.25;

/**
 * Pair each note with the recording of it: highest similarity at or above
 * MIN_SIMILARITY, latest wins a tie (so a re-recording replaces the first).
 * A context note recorded from a record's page may skip the name, so the
 * threshold is deliberately loose; each capture is used at most once.
 */
export function pairNotes(notes: KeyNote[], captures: ExportCapture[]): Map<number, { capture: ExportCapture; sim: number }> {
  const pairs: { n: number; capture: ExportCapture; sim: number }[] = [];
  for (const note of notes) {
    for (const c of captures) {
      const sim = similarity(note.script, c.transcript ?? "");
      if (sim >= MIN_SIMILARITY) pairs.push({ n: note.n, capture: c, sim });
    }
  }
  pairs.sort((a, b) => b.sim - a.sim || b.capture.created_at.localeCompare(a.capture.created_at));
  const out = new Map<number, { capture: ExportCapture; sim: number }>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.n) || used.has(p.capture.id)) continue;
    out.set(p.n, { capture: p.capture, sim: p.sim });
    used.add(p.capture.id);
  }
  return out;
}

// Scored on what the matcher proposed, not on what the reader did next.
// Discarding keeps entity_id and match_candidates, so a discarded card still
// shows its pick (entity set) or its hold (no entity, candidates offered), and
// cleaning up the test cards as you go does not change the score.
const filed = (c: ExportCard) => !!c.entity_id && c.status !== "held";
const held = (c: ExportCard) =>
  !c.entity_id && (c.status === "held" || (c.status === "discarded" && (c.match_candidates ?? []).length > 0));
const candidateIds = (c: ExportCard) => new Set((c.match_candidates ?? []).map((m) => m.id));

export function scoreNote(note: KeyNote, capture: ExportCapture | null, sim = 0): NoteResult {
  if (!capture) {
    return {
      n: note.n,
      captureId: null,
      similarity: 0,
      outcome: "miss",
      rows: note.expect.map((e) => ({ label: e.label, outcome: "missing" as const, detail: "not recorded", destOk: null })),
      wrongFilings: [],
    };
  }
  const cards = capture.cards;
  const allowed = new Set<string>();
  for (const e of note.expect) {
    if (e.match === "record") [...e.ids, ...(e.near ?? [])].forEach((id) => allowed.add(id));
    if (e.match === "hold") e.ids.forEach((id) => allowed.add(id));
  }
  const forbid = new Set(note.forbid ?? []);
  const wrongFilings = cards
    .filter(filed)
    .map((c) => c.entity_id as string)
    .filter((id) => forbid.has(id) || !allowed.has(id));

  const rows = note.expect.map((e) => {
    const destOk = e.dest ? cards.some((c) => c.dest === e.dest) : null;
    if (e.match === "none") {
      // Only filings outside this note's other expectations count against it.
      const stray = cards.some((c) => filed(c) && !allowed.has(c.entity_id as string));
      return { label: e.label, outcome: (stray ? "wrong" : "correct") as Outcome, detail: stray ? "filed to a record" : "nothing filed", destOk };
    }
    const ids = new Set(e.ids);
    const picked = cards.find((c) => filed(c) && ids.has(c.entity_id as string));
    const heldOk = cards.find((c) => held(c) && Array.from(candidateIds(c)).some((id) => ids.has(id)));
    if (e.match === "record") {
      if (picked) return { label: e.label, outcome: "correct" as Outcome, detail: "picked the right record", destOk };
      if (heldOk) return { label: e.label, outcome: "correct" as Outcome, detail: "held for a pick, right record offered", destOk };
      const near = new Set(e.near ?? []);
      if (cards.some((c) => filed(c) && near.has(c.entity_id as string))) {
        return { label: e.label, outcome: "miss" as Outcome, detail: "picked a near duplicate", destOk };
      }
      return { label: e.label, outcome: "miss" as Outcome, detail: "no card for this record", destOk };
    }
    // hold
    if (heldOk) return { label: e.label, outcome: "correct" as Outcome, detail: "held for a pick", destOk };
    if (picked) return { label: e.label, outcome: "miss" as Outcome, detail: "filed without asking (ambiguous name)", destOk };
    return { label: e.label, outcome: "miss" as Outcome, detail: "no card for this name", destOk };
  });

  const outcome: Outcome =
    wrongFilings.length > 0 || rows.some((r) => r.outcome === "wrong")
      ? "wrong"
      : rows.every((r) => r.outcome === "correct")
        ? "correct"
        : "miss";
  return { n: note.n, captureId: capture.id, similarity: sim, outcome, rows, wrongFilings };
}

export function scoreDod(key: AnswerKey, captures: ExportCapture[]): DodReport {
  const pairs = pairNotes(key.notes, captures);
  const results = key.notes
    .slice()
    .sort((a, b) => a.n - b.n)
    .map((note) => {
      const p = pairs.get(note.n);
      return scoreNote(note, p?.capture ?? null, p?.sim ?? 0);
    });
  const correct = results.filter((r) => r.outcome === "correct").length;
  const wrong = results.filter((r) => r.outcome === "wrong").length;
  const unrecorded = results.filter((r) => r.captureId === null).length;
  const miss = results.length - correct - wrong;
  return {
    results,
    correct,
    miss,
    wrong,
    unrecorded,
    pass: results.length >= DOD_TOTAL && correct >= DOD_MIN_CORRECT && wrong <= DOD_MAX_WRONG,
  };
}
