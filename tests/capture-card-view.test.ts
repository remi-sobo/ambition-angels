import { describe, expect, test } from "vitest";
import {
  canConfirm,
  cardText,
  confirmAllSummary,
  entityMeta,
  entityName,
  filedHref,
  filedLabel,
  fmtDay,
  heldTitle,
  orderCards,
  stackCounts,
  undoSecondsLeft,
  whatConfirmDoes,
  type CardView,
} from "@/app/admin/capture/_lib/cardView";
import { UNDO_WINDOW_MINUTES } from "@/lib/capture/constants";

// Capture C4: what each card says, derived without React.

let n = 0;
const card = (over: Partial<CardView> = {}): CardView => ({
  id: `c${++n}`,
  position: n,
  dest: "task",
  status: "proposed",
  entity_type: null,
  entity_id: null,
  heard_name: null,
  match_confidence: null,
  match_candidates: [],
  payload: { title: "Send the one-pager" },
  decided_at: null,
  applied_table: null,
  applied_id: null,
  ...over,
});

const maria = { kind: "constituent", id: "m1", name: "Maria Chen", org_name: "Koshland Foundation", meta: "person · last touch Sep 12" };

describe("what Confirm will do", () => {
  test("interaction on a person, with kind and day", () => {
    const c = card({
      dest: "interaction",
      entity_type: "constituent",
      entity_id: "m1",
      match_candidates: [maria],
      payload: { kind: "meeting", notes: "Coffee.", occurred_at: "2026-10-08", entity_name: "Maria Chen" },
    });
    expect(whatConfirmDoes(c)).toBe("Logs a meeting on Maria Chen's record for Thu Oct 8.");
    expect(cardText(c)).toBe("Coffee.");
  });

  test("interaction on a partner", () => {
    const c = card({ dest: "interaction", entity_type: "partner", entity_id: "p1", payload: { kind: "call", entity_name: "Harbor Light Academy" } });
    expect(whatConfirmDoes(c)).toBe("Logs a call on Harbor Light Academy's partner record.");
  });

  test("interaction with no record asks for a pick and can't be confirmed", () => {
    const c = card({ dest: "interaction", payload: { kind: "note", notes: "x" } });
    expect(whatConfirmDoes(c)).toBe("Pick who this was with to file it.");
    expect(canConfirm(c)).toBe(false);
  });

  test("task with assignee, due date, and link", () => {
    const c = card({
      entity_id: "m1",
      entity_type: "constituent",
      payload: { title: "Send the one-pager", due_date: "2026-10-16", assignee: { name: "Shannon Example", handle: "shannon" }, entity_name: "Maria Chen" },
    });
    expect(whatConfirmDoes(c)).toBe("Creates a task for Shannon, due Fri Oct 16, linked to Maria Chen.");
  });

  test("bare task, thought, and drafts", () => {
    expect(whatConfirmDoes(card())).toBe("Creates a task.");
    expect(whatConfirmDoes(card({ dest: "thought", payload: { text: "x" } }))).toBe("Adds it to the parking lot. No due date.");
    expect(whatConfirmDoes(card({ dest: "message_draft", payload: { channel: "email", body: "Hi", recipient_name: "Theo" } }))).toBe(
      "Saves a draft email to Theo. Nothing is sent.",
    );
    expect(whatConfirmDoes(card({ dest: "message_draft", heard_name: "Ana", payload: { channel: "text", body: "Hi" } }))).toBe(
      "Saves a draft text to Ana. Nothing is sent.",
    );
  });
});

describe("card state", () => {
  test("only a proposed card can be confirmed", () => {
    expect(canConfirm(card())).toBe(true);
    for (const status of ["held", "confirmed", "discarded"] as const) expect(canConfirm(card({ status }))).toBe(false);
  });

  test("held title uses the heard name", () => {
    expect(heldTitle(card({ status: "held", heard_name: "Maria" }))).toBe("Which Maria?");
    expect(heldTitle(card({ status: "held" }))).toBe("Who was this with?");
  });

  test("held cards sort first, then proposed, filed, discarded, by position", () => {
    const a = card({ position: 3 });
    const b = card({ position: 1, status: "confirmed" });
    const h = card({ position: 2, status: "held" });
    const d = card({ position: 0, status: "discarded" });
    const p = card({ position: 0 });
    expect(orderCards([a, b, h, d, p]).map((c) => c.id)).toEqual([h.id, p.id, a.id, b.id, d.id]);
  });

  test("counts", () => {
    expect(stackCounts([card(), card({ status: "held" }), card({ status: "confirmed" }), card({ status: "discarded" })])).toEqual({
      pending: 2,
      held: 1,
      proposed: 1,
      filed: 1,
    });
  });

  test("the undo window counts down from decided_at and closes", () => {
    const decided = Date.parse("2026-10-12T17:00:00Z");
    const c = card({ status: "confirmed", decided_at: new Date(decided).toISOString(), applied_table: "ops_tasks" });
    expect(undoSecondsLeft(c, decided)).toBe(UNDO_WINDOW_MINUTES * 60);
    expect(undoSecondsLeft(c, decided + 61_000)).toBe(UNDO_WINDOW_MINUTES * 60 - 61);
    expect(undoSecondsLeft(c, decided + UNDO_WINDOW_MINUTES * 60_000 + 1)).toBe(0);
    expect(undoSecondsLeft(card(), decided)).toBe(0);
  });
});

describe("names, links, and summaries", () => {
  test("entity name and meta come from the payload or the candidates", () => {
    const c = card({ entity_id: "m1", match_candidates: [maria] });
    expect(entityName(c)).toBe("Maria Chen");
    expect(entityMeta(c)).toBe("Koshland Foundation · person · last touch Sep 12");
    expect(entityName(card())).toBeNull();
  });

  test("filed links go to the record or the task list; drafts have none", () => {
    expect(filedHref(card({ applied_table: "interactions", entity_id: "m1" }))).toBe("/admin/fundraising/donors/m1");
    expect(filedHref(card({ applied_table: "partner_interactions", entity_id: "p1" }))).toBe("/admin/partners/p1");
    expect(filedHref(card({ applied_table: "ops_tasks" }))).toBe("/admin/work/tasks");
    expect(filedHref(card({ applied_table: "reed_drafts" }))).toBeNull();
    expect(filedLabel(card({ dest: "thought", applied_table: "ops_tasks" }))).toBe("In the parking lot");
    expect(filedLabel(card({ applied_table: "reed_drafts" }))).toBe("Draft saved");
  });

  test("confirm-all summary", () => {
    expect(confirmAllSummary({ results: [{ id: "a", ok: true }, { id: "b", ok: true }], held_skipped: 1, already_confirmed: 0 })).toBe(
      "Filed 2. 1 still needs a pick.",
    );
    expect(
      confirmAllSummary({ results: [{ id: "a", ok: true }, { id: "b", ok: false, error: "no" }], held_skipped: 2, already_confirmed: 0 }),
    ).toBe("Filed 1. 1 couldn't be filed. 2 still need a pick.");
    expect(confirmAllSummary({ results: [], held_skipped: 0, already_confirmed: 3 })).toBe("Nothing new to file.");
  });

  test("fmtDay", () => {
    expect(fmtDay("2026-10-16")).toBe("Fri Oct 16");
    expect(fmtDay("soon")).toBeNull();
  });
});
