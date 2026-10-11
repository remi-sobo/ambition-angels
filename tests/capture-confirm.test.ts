import { describe, expect, test } from "vitest";
import { confirmAll, confirmCard, discardCard, undoCard } from "@/lib/capture/confirm";
import { CONFIRM_IN_FLIGHT_SECONDS, UNDO_WINDOW_MINUTES } from "@/lib/capture/constants";
import { refLabel } from "@/lib/capture/apply/task";
import { MARISOL, OWNER, STAFF, T0, card, draftCard, interactionCard, partnerCard, thoughtCard, world } from "./support/captureWorld";

// Capture C3 steps 3, 5, 6: claim-then-apply confirm, discard, undo, and
// confirm-all, run against the in-memory session client.

describe("confirm", () => {
  test("files one row, records applied_* and the snapshot, and closes the capture", async () => {
    const c = interactionCard();
    const w = world([c]);
    const r = await confirmCard(w.deps, c.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied?.table).toBe("interactions");
    const row = w.cardRow(c.id);
    expect(row.status).toBe("confirmed");
    expect(row.decided_by).toBe(OWNER);
    expect(row.applied_table).toBe("interactions");
    expect(row.applied_id).toBe(w.db.tables.interactions[0].id);
    expect((row.payload.applied_snapshot as Record<string, unknown>).constituent_id).toBe(MARISOL);
    expect(w.captureStatus()).toBe("done");
  });

  test("double confirm returns the same row and inserts once", async () => {
    const c = card();
    const w = world([c]);
    const a = await confirmCard(w.deps, c.id);
    const b = await confirmCard(w.deps, c.id);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.applied?.id).toBe(a.applied?.id);
    expect(w.db.tables.ops_tasks).toHaveLength(1);
  });

  test("a claim race between two taps inserts exactly one row", async () => {
    const c = card();
    const w = world([c]);
    const [a, b] = await Promise.all([confirmCard(w.deps, c.id), confirmCard(w.deps, c.id)]);
    expect(w.db.tables.ops_tasks).toHaveLength(1);
    const oks = [a, b].filter((r) => r.ok);
    expect(oks.length).toBeGreaterThanOrEqual(1);
    for (const r of [a, b]) if (!r.ok) expect(r.status).toBe(409);
  });

  test("crash recovery: confirmed with no applied_id re-runs the applier and finds the row by provenance", async () => {
    const c = card({ status: "confirmed", decided_by: OWNER, decided_at: new Date(T0 - 5 * 60_000).toISOString() });
    const w = world([c]);
    w.db.tables.ops_tasks.push({ id: "orphan-task", org_id: c.org_id, title: "Send the one-pager", labels: ["capture", refLabel(c.id)], updated_at: "2026-10-09T16:55:00Z" });
    const r = await confirmCard(w.deps, c.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.applied).toEqual({ table: "ops_tasks", id: "orphan-task" });
    expect(w.db.tables.ops_tasks).toHaveLength(1);
    expect(w.cardRow(c.id).applied_id).toBe("orphan-task");
  });

  test("crash recovery with no row yet inserts it", async () => {
    const c = interactionCard({ status: "confirmed", decided_by: OWNER, decided_at: new Date(T0 - 60_000).toISOString() });
    const w = world([c]);
    const r = await confirmCard(w.deps, c.id);
    expect(r.ok).toBe(true);
    expect(w.db.tables.interactions).toHaveLength(1);
  });

  test("a claim younger than the in-flight window is another request still working: 409", async () => {
    const c = card({ status: "confirmed", decided_by: OWNER, decided_at: new Date(T0 - (CONFIRM_IN_FLIGHT_SECONDS - 5) * 1000).toISOString() });
    const w = world([c]);
    const r = await confirmCard(w.deps, c.id);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(w.db.tables.ops_tasks).toHaveLength(0);
  });

  test("held without a pick is 409; held with a pick confirms", async () => {
    const c = interactionCard({ status: "held", entity_type: null, entity_id: null, match_candidates: [] });
    const w = world([c]);
    expect(await confirmCard(w.deps, c.id)).toMatchObject({ ok: false, status: 409 });
    expect(w.db.tables.interactions).toHaveLength(0);

    const r = await confirmCard(w.deps, c.id, { entity: { type: "constituent", id: MARISOL } });
    expect(r.ok).toBe(true);
    expect(w.db.tables.interactions).toHaveLength(1);
    expect(w.db.tables.interactions[0].constituent_id).toBe(MARISOL);
  });

  test("discarded is 409", async () => {
    const c = card({ status: "discarded" });
    const w = world([c]);
    expect(await confirmCard(w.deps, c.id)).toMatchObject({ ok: false, status: 409 });
  });

  test("another user's card is a 404 (personal RLS)", async () => {
    const c = card({ created_by: STAFF });
    const w = world([c]);
    expect(await confirmCard(w.deps, c.id)).toMatchObject({ ok: false, status: 404 });
    expect(w.db.tables.ops_tasks).toHaveLength(0);
  });

  test("permission pre-check: no fundraising.write -> 403 naming donor records, nothing claimed", async () => {
    const c = interactionCard();
    const w = world([c], { perms: ["ops.write"] });
    const r = await confirmCard(w.deps, c.id);
    expect(r).toMatchObject({ ok: false, status: 403 });
    if (!r.ok) expect(r.error).toMatch(/donor records/);
    expect(w.cardRow(c.id).status).toBe("proposed");
  });

  test("an RLS denial at insert reverts the claim and returns 403", async () => {
    const c = partnerCard();
    const w = world([c], { db: { denyInsert: new Set(["partner_interactions"]) } });
    const r = await confirmCard(w.deps, c.id);
    expect(r).toMatchObject({ ok: false, status: 403 });
    if (!r.ok) expect(r.error).toMatch(/partner records/);
    const row = w.cardRow(c.id);
    expect(row.status).toBe("proposed");
    expect(row.decided_at).toBeNull();
    expect(w.captureStatus()).toBe("ready");
  });
});

describe("discard", () => {
  test("proposed and held -> discarded; the capture closes when nothing is left", async () => {
    const a = card({ position: 0 });
    const b = interactionCard({ position: 1, status: "held", entity_type: null, entity_id: null });
    const w = world([a, b]);
    expect(await discardCard(w.deps, a.id)).toMatchObject({ ok: true });
    expect(w.captureStatus()).toBe("ready");
    expect(await discardCard(w.deps, b.id)).toMatchObject({ ok: true });
    expect(w.cardRow(b.id).status).toBe("discarded");
    expect(w.captureStatus()).toBe("done");
  });

  test("a confirmed card can't be discarded", async () => {
    const c = card();
    const w = world([c]);
    await confirmCard(w.deps, c.id);
    expect(await discardCard(w.deps, c.id)).toMatchObject({ ok: false, status: 409 });
    expect(w.db.tables.ops_tasks).toHaveLength(1);
  });
});

describe("undo", () => {
  test("within the window and untouched: the row is deleted and the card is proposed again", async () => {
    const c = interactionCard();
    const w = world([c]);
    await confirmCard(w.deps, c.id);
    expect(w.captureStatus()).toBe("done");
    w.advance(2 * 60_000);
    const r = await undoCard(w.deps, c.id);
    expect(r).toMatchObject({ ok: true, undone: true });
    expect(w.db.tables.interactions).toHaveLength(0);
    const row = w.cardRow(c.id);
    expect(row.status).toBe("proposed");
    expect(row.applied_table).toBeNull();
    expect(row.applied_id).toBeNull();
    expect(row.decided_by).toBeNull();
    expect(row.decided_at).toBeNull();
    expect(row.payload.applied_snapshot).toBeUndefined();
    expect(row.payload.notes).toBe("Coffee. Wants the impact numbers.");
    expect(w.captureStatus()).toBe("ready");
    expect(w.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "capture.interaction.undo" }));
  });

  test("each destination undoes cleanly", async () => {
    for (const make of [partnerCard, card, thoughtCard, draftCard]) {
      const c = make();
      const w = world([c]);
      await confirmCard(w.deps, c.id);
      expect(await undoCard(w.deps, c.id)).toMatchObject({ ok: true });
      const t = w.cardRow(c.id).applied_table;
      expect(t).toBeNull();
      expect(w.db.deletes).toHaveLength(1);
    }
  });

  test("a row changed after filing stays: 409", async () => {
    const c = card();
    const w = world([c]);
    await confirmCard(w.deps, c.id);
    w.advance(1000);
    await w.deps.supabase.from("ops_tasks").update({ status: "in_progress" }).eq("id", w.db.tables.ops_tasks[0].id);
    const r = await undoCard(w.deps, c.id);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(w.db.tables.ops_tasks).toHaveLength(1);
    expect(w.cardRow(c.id).status).toBe("confirmed");
  });

  test("an ops_tasks / reed_drafts touch that only moves updated_at still blocks", async () => {
    const c = draftCard();
    const w = world([c]);
    await confirmCard(w.deps, c.id);
    w.advance(1000);
    await w.deps.supabase.from("reed_drafts").update({ body: "Hi Marisol, here are the numbers." }).eq("id", w.db.tables.reed_drafts[0].id);
    expect(await undoCard(w.deps, c.id)).toMatchObject({ ok: false, status: 409 });
    expect(w.db.tables.reed_drafts).toHaveLength(1);
  });

  test("an edited interaction note stays: 409", async () => {
    const c = interactionCard();
    const w = world([c]);
    await confirmCard(w.deps, c.id);
    w.db.tables.interactions[0].notes = "Edited on the donor page.";
    expect(await undoCard(w.deps, c.id)).toMatchObject({ ok: false, status: 409 });
    expect(w.db.tables.interactions).toHaveLength(1);
  });

  test("outside the window: 409", async () => {
    const c = card();
    const w = world([c]);
    await confirmCard(w.deps, c.id);
    w.advance((UNDO_WINDOW_MINUTES + 1) * 60_000);
    expect(await undoCard(w.deps, c.id)).toMatchObject({ ok: false, status: 409 });
    expect(w.db.tables.ops_tasks).toHaveLength(1);
  });

  test("a proposed card has nothing to undo", async () => {
    const c = card();
    const w = world([c]);
    expect(await undoCard(w.deps, c.id)).toMatchObject({ ok: false, status: 409 });
  });

  test("undo then confirm again files a fresh row", async () => {
    const c = card();
    const w = world([c]);
    const a = await confirmCard(w.deps, c.id);
    await undoCard(w.deps, c.id);
    const b = await confirmCard(w.deps, c.id);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.applied?.id).not.toBe(a.applied?.id);
    expect(w.db.tables.ops_tasks).toHaveLength(1);
  });
});

describe("confirm-all", () => {
  test("proposed cards in position order, held skipped and counted, failures reported per card", async () => {
    const t = card({ position: 2 });
    const i = interactionCard({ position: 0 });
    const held = interactionCard({ position: 1, status: "held", entity_type: null, entity_id: null });
    const gone = card({ position: 3, status: "discarded" });
    const p = partnerCard({ position: 4 });
    const w = world([t, i, held, gone, p], { perms: ["fundraising.write", "ops.write"] });
    const r = await confirmAll(w.deps, w.db.tables.captures[0].id as string);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.results.map((x) => x.id)).toEqual([i.id, t.id, p.id]);
    expect(r.results.map((x) => x.ok)).toEqual([true, true, false]);
    expect(r.results[2].error).toMatch(/partner records/);
    expect(r.held_skipped).toBe(1);
    expect(r.already_confirmed).toBe(0);
    expect(r.capture_status).toBe("ready");
    expect(w.db.tables.interactions).toHaveLength(1);
    expect(w.db.tables.ops_tasks).toHaveLength(1);
    expect(w.db.tables.partner_interactions).toHaveLength(0);
  });

  test("capture status: ready -> done when everything is filed -> ready after an undo", async () => {
    const a = card({ position: 0 });
    const b = thoughtCard({ position: 1 });
    const w = world([a, b]);
    expect(w.captureStatus()).toBe("ready");
    const r = await confirmAll(w.deps, w.db.tables.captures[0].id as string);
    expect(r.ok && r.capture_status).toBe("done");
    await undoCard(w.deps, b.id);
    expect(w.captureStatus()).toBe("ready");
    const again = await confirmAll(w.deps, w.db.tables.captures[0].id as string);
    expect(again.ok && again.already_confirmed).toBe(1);
    expect(again.ok && again.capture_status).toBe("done");
  });

  test("another user's capture is a 404", async () => {
    const w = world([card()], { userId: STAFF });
    expect(await confirmAll(w.deps, w.db.tables.captures[0].id as string)).toMatchObject({ ok: false, status: 404 });
  });
});
