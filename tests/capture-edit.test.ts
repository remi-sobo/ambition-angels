import { describe, expect, test } from "vitest";
import { checkPatch, editCard } from "@/lib/capture/edit";
import { confirmCard } from "@/lib/capture/confirm";
import { MAX_TRANSCRIPT_CHARS } from "@/lib/capture/constants";
import { ARCHIVED, FOREIGN, HARBOR, MARISOL, PROSPECT, STAFF, card, draftCard, interactionCard, world } from "./support/captureWorld";

// Capture C3 step 4: edit a proposed or held card. Picks are re-verified
// server-side; destination changes go back through the parse validator's
// per-destination rules.

const heldInteraction = () =>
  interactionCard({ status: "held", entity_type: null, entity_id: null, heard_name: "Marisol", match_candidates: [], payload: { kind: "call", notes: "Called about the gala.", occurred_at: "2026-10-08" } });

describe("entity pick", () => {
  test("a pick in the caller's org is re-verified, named, and moves held -> proposed", async () => {
    const c = heldInteraction();
    const w = world([c]);
    const r = await editCard(w.deps, c.id, { entity: { type: "constituent", id: MARISOL } });
    expect(r.ok).toBe(true);
    const row = w.cardRow(c.id);
    expect(row.status).toBe("proposed");
    expect(row.entity_type).toBe("constituent");
    expect(row.entity_id).toBe(MARISOL);
    expect(row.payload.entity_name).toBe("Marisol Quintero");
    expect(row.match_candidates.some((m) => m.id === MARISOL)).toBe(true);
  });

  test("a partner pick works the same way", async () => {
    const c = heldInteraction();
    const w = world([c]);
    expect(await editCard(w.deps, c.id, { entity: { type: "partner", id: HARBOR } })).toMatchObject({ ok: true });
    expect(w.cardRow(c.id).payload.entity_name).toBe("Harbor Light Academy");
  });

  test("another org's record, an archived record, or a made-up id is a 404", async () => {
    const c = heldInteraction();
    const w = world([c]);
    for (const id of [FOREIGN, ARCHIVED, "00000000-0000-0000-0000-0000000000ff"]) {
      expect(await editCard(w.deps, c.id, { entity: { type: "constituent", id } })).toMatchObject({ ok: false, status: 404 });
    }
    expect(w.cardRow(c.id).status).toBe("held");
  });

  test("a prospect or a student is rejected", async () => {
    const c = heldInteraction();
    const w = world([c]);
    expect(await editCard(w.deps, c.id, { entity: { type: "prospect", id: PROSPECT } })).toMatchObject({ ok: false, status: 400 });
    expect(await editCard(w.deps, c.id, { entity: { type: "student", id: MARISOL } })).toMatchObject({ ok: false, status: 400 });
  });

  test("unpicking an interaction holds it again", async () => {
    const c = interactionCard();
    const w = world([c]);
    await editCard(w.deps, c.id, { entity: null });
    const row = w.cardRow(c.id);
    expect(row.status).toBe("held");
    expect(row.entity_id).toBeNull();
    expect(row.payload.entity_name).toBeUndefined();
  });
});

describe("fields and destination", () => {
  test("text edits are cleaned and kept; other fields survive", async () => {
    const c = interactionCard();
    const w = world([c]);
    await editCard(w.deps, c.id, { notes: "  Coffee   at Blue Bottle.  ", kind: "meeting" });
    const row = w.cardRow(c.id);
    expect(row.payload.notes).toBe("Coffee at Blue Bottle.");
    expect(row.payload.kind).toBe("meeting");
    expect(row.payload.occurred_at).toBe("2026-10-08");
    expect(row.status).toBe("proposed");
  });

  test("kind email is coerced to note, like the parse", async () => {
    const c = interactionCard();
    const w = world([c]);
    await editCard(w.deps, c.id, { kind: "email" });
    expect(w.cardRow(c.id).payload.kind).toBe("note");
  });

  test("assignee by handle or user id; unknown assignee is a 400", async () => {
    const c = card();
    const w = world([c]);
    await editCard(w.deps, c.id, { assignee: "shannon", due: "2026-10-16", category: "fundraising" });
    expect(w.cardRow(c.id).payload.assignee).toEqual({ handle: "shannon", user_id: STAFF, name: "Shannon Example" });
    expect(w.cardRow(c.id).payload.due_date).toBe("2026-10-16");
    expect(await editCard(w.deps, c.id, { assignee: "nobody" })).toMatchObject({ ok: false, status: 400 });
    await editCard(w.deps, c.id, { assignee: null });
    expect(w.cardRow(c.id).payload.assignee).toBeNull();
  });

  test("a bad category falls back to other", async () => {
    const c = card();
    const w = world([c]);
    await editCard(w.deps, c.id, { category: "parties" });
    expect(w.cardRow(c.id).payload.category).toBe("other");
  });

  test("task -> interaction without a record is held; with the card's record it is proposed", async () => {
    const c = card({ payload: { title: "Thank Marisol for the gift", category: "fundraising" } });
    const w = world([c]);
    await editCard(w.deps, c.id, { dest: "interaction" });
    let row = w.cardRow(c.id);
    expect(row.dest).toBe("interaction");
    expect(row.status).toBe("held");
    expect(row.payload.notes).toBe("Thank Marisol for the gift");
    expect(row.payload.kind).toBe("note");

    await editCard(w.deps, c.id, { entity: { type: "constituent", id: MARISOL } });
    row = w.cardRow(c.id);
    expect(row.status).toBe("proposed");
    expect(await confirmCard(w.deps, c.id)).toMatchObject({ ok: true });
    expect(w.db.tables.interactions).toHaveLength(1);
  });

  test("held interaction -> task keeps the words as the title; it stays held until a pick or an explicit unpick", async () => {
    const c = heldInteraction();
    const w = world([c]);
    await editCard(w.deps, c.id, { dest: "task" });
    let row = w.cardRow(c.id);
    expect(row.dest).toBe("task");
    expect(row.status).toBe("held");
    expect(row.payload.title).toBe("Called about the gala.");
    expect(row.payload.category).toBe("other");

    await editCard(w.deps, c.id, { entity: null });
    row = w.cardRow(c.id);
    expect(row.status).toBe("proposed");
    expect(await confirmCard(w.deps, c.id)).toMatchObject({ ok: true });
    expect(w.db.tables.ops_tasks[0].linked_entity_id).toBeNull();
  });

  test("a message draft: a bad channel falls back to email; text drops the subject", async () => {
    const c = draftCard();
    const w = world([c]);
    await editCard(w.deps, c.id, { channel: "pigeon" });
    expect(w.cardRow(c.id).payload.channel).toBe("email");
    await editCard(w.deps, c.id, { channel: "text" });
    expect(w.cardRow(c.id).payload.subject).toBeNull();
  });

  test("an edit that empties the card is a 400", async () => {
    const c = card();
    const w = world([c]);
    expect(await editCard(w.deps, c.id, { title: "   " })).toMatchObject({ ok: false, status: 400 });
  });

  test("unknown keys, non-objects, and over-limit text are rejected before any read", () => {
    expect(checkPatch({ status: "confirmed" })).toMatch(/unknown field/);
    expect(checkPatch("notes")).toMatch(/object/);
    expect(checkPatch({ notes: "x".repeat(MAX_TRANSCRIPT_CHARS + 1) })).toMatch(/too long/);
    expect(checkPatch({ notes: "fine" })).toBeNull();
  });

  test("a confirmed or discarded card can't be edited", async () => {
    const a = card();
    const b = card({ status: "discarded" });
    const w = world([a, b]);
    await confirmCard(w.deps, a.id);
    expect(await editCard(w.deps, a.id, { title: "New" })).toMatchObject({ ok: false, status: 409 });
    expect(await editCard(w.deps, b.id, { title: "New" })).toMatchObject({ ok: false, status: 409 });
  });

  test("another user's card is a 404", async () => {
    const c = card({ created_by: STAFF });
    const w = world([c]);
    expect(await editCard(w.deps, c.id, { title: "Mine now" })).toMatchObject({ ok: false, status: 404 });
  });
});
