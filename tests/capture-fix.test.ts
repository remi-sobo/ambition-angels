import { describe, expect, test } from "vitest";
import { confirmCard, undoCard } from "@/lib/capture/confirm";
import { moveFiled, removeFiled, reviseFiled } from "@/lib/capture/fix";
import { reviseUpdate } from "@/lib/capture/apply";
import {
  ARCHIVED,
  FOREIGN,
  HARBOR,
  MARISOL,
  ORG,
  STAFF,
  T0,
  card,
  interactionCard,
  partnerCard,
  world,
  type World,
} from "./support/captureWorld";

// Capture C6: fix after confirm. Revise, move, and remove a filed interaction
// or partner touch, from the creator's card, fenced to the card's own row.

const DANA = "00000000-0000-0000-0000-00000000d004";
const BAYVIEW = "00000000-0000-0000-0000-00000000e002";

function seedMore(w: World) {
  w.db.tables.constituents.push({ id: DANA, org_id: ORG, type: "person", first_name: "Dana", last_name: "Whitfield", org_name: null, archived_at: null });
  w.db.tables.partners.push({ id: BAYVIEW, org_id: ORG, name: "Bayview Prep", last_touch_at: "2026-09-01" });
}

async function filed(w: World, id: string) {
  const res = await confirmCard(w.deps, id);
  if (!res.ok) throw new Error(res.error);
  return res;
}

const HOUR = 3600_000;

describe("reviseUpdate", () => {
  const now = new Date(T0);
  test("maps kind, date (noon UTC), and notes; nothing else", () => {
    expect(reviseUpdate({ kind: "call", occurred_at: "2026-10-01", notes: "  Better notes " }, now)).toEqual({
      kind: "call",
      occurred_at: "2026-10-01T12:00:00Z",
      notes: "Better notes",
    });
    expect(reviseUpdate({ notes: "" }, now)).toEqual({ notes: null });
  });

  test("refuses unknown fields, email, bad or future dates, and an empty patch", () => {
    const status = (p: unknown) => {
      try {
        reviseUpdate(p, now);
        return 200;
      } catch (e) {
        return (e as { status: number }).status;
      }
    };
    expect(status({ constituent_id: MARISOL })).toBe(400);
    expect(status({})).toBe(400);
    expect(status([])).toBe(400);
    expect(status({ kind: "email" })).toBe(422);
    expect(status({ occurred_at: "Oct 1" })).toBe(422);
    expect(status({ occurred_at: "2026-12-25" })).toBe(422);
    expect(status({ notes: 4 })).toBe(422);
  });
});

describe("revise", () => {
  test("changes the filed row, stamps it, refreshes the snapshot, and audits", async () => {
    const c = interactionCard();
    const w = world([c]);
    await filed(w, c.id);
    w.advance(2 * HOUR);

    const res = await reviseFiled(w.deps, c.id, { kind: "call", notes: "Phone call, not coffee." });
    expect(res.ok).toBe(true);
    const row = w.db.tables.interactions[0];
    expect(row).toMatchObject({ kind: "call", notes: "Phone call, not coffee.", constituent_id: MARISOL, edited_by: "remi" });
    expect(row.edited_at).toBe(new Date(T0 + 2 * HOUR).toISOString());
    expect(w.cardRow(c.id).payload.applied_snapshot).toMatchObject({ kind: "call", notes: "Phone call, not coffee." });
    expect(w.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "capture.interaction.revise", entityType: "interactions" }));
  });

  test("undo inside its window still works after a revise", async () => {
    const c = interactionCard();
    const w = world([c]);
    await filed(w, c.id);
    await reviseFiled(w.deps, c.id, { notes: "Edited right away." });
    const undone = await undoCard(w.deps, c.id);
    expect(undone.ok).toBe(true);
    expect(w.db.tables.interactions).toHaveLength(0);
  });

  test("works on a partner touch too", async () => {
    const c = partnerCard();
    const w = world([c]);
    await filed(w, c.id);
    const res = await reviseFiled(w.deps, c.id, { occurred_at: "2026-10-02" });
    expect(res.ok).toBe(true);
    expect(w.db.tables.partner_interactions[0]).toMatchObject({ occurred_at: "2026-10-02T12:00:00Z", edited_by: "remi" });
  });

  test("never reaches a row that isn't this card's capture filing", async () => {
    const c = interactionCard();
    const w = world([c]);
    await filed(w, c.id);
    w.db.tables.interactions[0].external_source = "manual";
    const res = await reviseFiled(w.deps, c.id, { notes: "x" });
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect(w.db.tables.interactions[0].notes).toBe("Coffee. Wants the impact numbers.");
  });

  test("bad patch is refused before anything is read", async () => {
    const c = interactionCard();
    const w = world([c]);
    await filed(w, c.id);
    expect(await reviseFiled(w.deps, c.id, { kind: "email" })).toMatchObject({ ok: false, status: 422 });
    expect(await reviseFiled(w.deps, c.id, { entity_id: DANA })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("who and what can be fixed", () => {
  test("a card someone else recorded is not found", async () => {
    const c = interactionCard();
    const w = world([c]);
    await filed(w, c.id);
    const other = world([], { userId: STAFF });
    other.db.tables.capture_cards = w.db.tables.capture_cards;
    other.db.tables.interactions = w.db.tables.interactions;
    expect(await reviseFiled(other.deps, c.id, { notes: "x" })).toMatchObject({ ok: false, status: 404 });
    expect(await removeFiled(other.deps, c.id)).toMatchObject({ ok: false, status: 404 });
  });

  test("only a filed card: proposed, held, and discarded are 409", async () => {
    const proposed = interactionCard();
    const held = interactionCard({ status: "held", entity_id: null, entity_type: null });
    const discarded = interactionCard({ status: "discarded" });
    const w = world([proposed, held, discarded]);
    for (const c of [proposed, held, discarded]) {
      expect(await reviseFiled(w.deps, c.id, { notes: "x" })).toMatchObject({ ok: false, status: 409 });
    }
  });

  test("tasks and drafts are fixed where they live, not here", async () => {
    const t = card();
    const w = world([t]);
    await filed(w, t.id);
    const res = await removeFiled(w.deps, t.id);
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(w.db.tables.ops_tasks).toHaveLength(1);
  });

  test("no destination permission: 403 from the pre-check, nothing changes", async () => {
    const c = interactionCard();
    const w = world([c]);
    await filed(w, c.id);
    w.perms.delete("fundraising.write");
    expect(await reviseFiled(w.deps, c.id, { notes: "x" })).toMatchObject({ ok: false, status: 403, error: expect.stringMatching(/donor records/) });
    expect(await removeFiled(w.deps, c.id)).toMatchObject({ ok: false, status: 403 });
    expect(w.db.tables.interactions).toHaveLength(1);
  });

  test("RLS refusing the write is a 403 too", async () => {
    const c = interactionCard();
    const w = world([c], { db: { denyUpdate: new Set(["interactions"]), denyDelete: new Set(["interactions"]) } });
    await filed(w, c.id);
    expect(await reviseFiled(w.deps, c.id, { notes: "x" })).toMatchObject({ ok: false, status: 403 });
    expect(await removeFiled(w.deps, c.id)).toMatchObject({ ok: false, status: 403 });
    expect(w.cardRow(c.id).status).toBe("confirmed");
  });
});

describe("move", () => {
  test("to another person: the row and the card follow, stamped and audited", async () => {
    const c = interactionCard();
    const w = world([c]);
    seedMore(w);
    await filed(w, c.id);
    const res = await moveFiled(w.deps, c.id, { type: "constituent", id: DANA });
    expect(res.ok).toBe(true);
    expect(w.db.tables.interactions[0]).toMatchObject({ constituent_id: DANA, edited_by: "remi" });
    const after = w.cardRow(c.id);
    expect(after).toMatchObject({ entity_type: "constituent", entity_id: DANA, status: "confirmed" });
    expect(after.payload.entity_name).toBe("Dana Whitfield");
    expect(after.payload.applied_snapshot).toMatchObject({ constituent_id: DANA });
    expect(w.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "capture.interaction.move" }));

    // The applier's provenance lookup still finds the moved row (no double insert on a retried confirm).
    const again = await confirmCard(w.deps, c.id);
    expect(again.ok).toBe(true);
    expect(w.db.tables.interactions).toHaveLength(1);
  });

  test("same type only; not to the same record; never an archived or other-org record", async () => {
    const c = interactionCard();
    const w = world([c]);
    seedMore(w);
    await filed(w, c.id);
    expect(await moveFiled(w.deps, c.id, { type: "partner", id: HARBOR })).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(/another person/) });
    expect(await moveFiled(w.deps, c.id, { type: "constituent", id: MARISOL })).toMatchObject({ ok: false, status: 400 });
    expect(await moveFiled(w.deps, c.id, { type: "constituent", id: ARCHIVED })).toMatchObject({ ok: false, status: 404 });
    expect(await moveFiled(w.deps, c.id, { type: "constituent", id: FOREIGN })).toMatchObject({ ok: false, status: 404 });
    expect(await moveFiled(w.deps, c.id, { type: "prospect", id: DANA })).toMatchObject({ ok: false, status: 400 });
    expect(await moveFiled(w.deps, c.id, null)).toMatchObject({ ok: false, status: 400 });
    expect(w.db.tables.interactions[0].constituent_id).toBe(MARISOL);
  });

  test("a partner touch moves to another partner and bumps its touch date; the old one stays", async () => {
    const c = partnerCard();
    const w = world([c]);
    seedMore(w);
    await filed(w, c.id);
    const res = await moveFiled(w.deps, c.id, { type: "partner", id: BAYVIEW });
    expect(res.ok).toBe(true);
    expect(w.db.tables.partner_interactions[0]).toMatchObject({ partner_id: BAYVIEW, edited_by: "remi" });
    const touch = (id: string) => w.db.tables.partners.find((p) => p.id === id)?.last_touch_at;
    expect(touch(BAYVIEW)).toBe("2026-10-08");
    expect(touch(HARBOR)).toBe("2026-10-08");
    expect(await moveFiled(w.deps, c.id, { type: "constituent", id: DANA })).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(/another partner/) });
  });
});

describe("remove", () => {
  test("deletes the row, discards the card with who and when, and audits the before", async () => {
    const c = interactionCard();
    const w = world([c]);
    await filed(w, c.id);
    w.advance(HOUR);
    const res = await removeFiled(w.deps, c.id);
    expect(res).toMatchObject({ ok: true, removed: true });
    expect(w.db.tables.interactions).toHaveLength(0);
    const after = w.cardRow(c.id);
    expect(after.status).toBe("discarded");
    expect(after.payload.removed).toEqual({ at: new Date(T0 + HOUR).toISOString(), by: "remi" });
    expect(after.payload.applied_snapshot).toBeUndefined();
    expect(w.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "capture.interaction.remove", before: expect.objectContaining({ constituent_id: MARISOL }) }));
    expect(await removeFiled(w.deps, c.id)).toMatchObject({ ok: false, status: 409 });
  });

  test("a row that's already gone is a 404 and the card is left alone", async () => {
    const c = partnerCard();
    const w = world([c]);
    await filed(w, c.id);
    w.db.tables.partner_interactions = [];
    expect(await removeFiled(w.deps, c.id)).toMatchObject({ ok: false, status: 404 });
    expect(w.cardRow(c.id).status).toBe("confirmed");
  });
});
