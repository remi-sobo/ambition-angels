import { describe, expect, test } from "vitest";
import { ApplyError, applierFor, type CardRow } from "@/lib/capture/apply";
import { interactionApplier } from "@/lib/capture/apply/interactions";
import { partnerInteractionApplier } from "@/lib/capture/apply/partnerInteraction";
import { refLabel, taskApplier, taskInsert } from "@/lib/capture/apply/task";
import { draftApplier, draftInsert } from "@/lib/capture/apply/draft";
import {
  CAPTURE,
  CAPTURE_ID,
  HARBOR,
  MARISOL,
  ORG,
  STAFF,
  card,
  draftCard,
  interactionCard,
  partnerCard,
  thoughtCard,
  world,
} from "./support/captureWorld";

// Capture C3 step 2: the four appliers, each on its own. Insert shape,
// provenance, lookup-before-insert, RLS denial -> 403 naming the destination,
// and never a student.

/** The inserted row minus the columns the database fills in. */
const strip = (r: Record<string, unknown>) => {
  const out = { ...r };
  delete out.id;
  delete out.created_at;
  delete out.updated_at;
  return out;
};

const rejects = async (p: Promise<unknown>, status: number, msg?: RegExp) => {
  const e = await p.then(
    () => null,
    (err) => err,
  );
  expect(e).toBeInstanceOf(ApplyError);
  expect((e as ApplyError).status).toBe(status);
  if (msg) expect((e as ApplyError).message).toMatch(msg);
};

describe("interaction applier (constituent -> interactions)", () => {
  test("inserts exactly the agreed row, with capture provenance, and audits", async () => {
    const c = interactionCard();
    const w = world([c]);
    const res = await interactionApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    expect(res.table).toBe("interactions");
    expect(w.db.inserts).toHaveLength(1);
    const { id, created_at, updated_at, ...row } = w.db.inserts[0].row;
    expect(id).toBe(res.id);
    expect(created_at && updated_at).toBeTruthy();
    expect(row).toEqual({
      org_id: ORG,
      constituent_id: MARISOL,
      kind: "meeting",
      occurred_at: "2026-10-08T12:00:00Z",
      notes: "Coffee. Wants the impact numbers.",
      logged_by: "remi",
      external_source: "capture",
      external_id: c.id,
    });
    expect(res.snapshot).toEqual({ constituent_id: MARISOL, kind: "meeting", occurred_at: "2026-10-08T12:00:00Z", notes: row.notes });
    expect(w.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "capture.interaction.create", entityType: "interactions", entityId: res.id }));
  });

  test("looks up by provenance first and returns the existing row", async () => {
    const c = interactionCard();
    const w = world([c]);
    const a = await interactionApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    const b = await interactionApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    expect(b.id).toBe(a.id);
    expect(w.db.tables.interactions).toHaveLength(1);
  });

  test("an RLS denial is a 403 that names donor records", async () => {
    const c = interactionCard();
    const w = world([c], { db: { denyInsert: new Set(["interactions"]) } });
    await rejects(interactionApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE), 403, /donor records/);
  });

  test("rejects email (Gmail sync owns email) and caps notes at 4000", async () => {
    const w = world([]);
    await rejects(
      interactionApplier.apply(w.deps.supabase, w.deps.ctx, interactionCard({ payload: { kind: "email", notes: "x", occurred_at: "2026-10-08" } }), CAPTURE),
      422,
    );
    const long = interactionCard({ payload: { kind: "note", notes: "y".repeat(5000), occurred_at: "2026-10-08" } });
    await interactionApplier.apply(w.deps.supabase, w.deps.ctx, long, CAPTURE);
    expect((w.db.tables.interactions[0].notes as string).length).toBe(4000);
  });
});

describe("partner interaction applier (partner -> partner_interactions)", () => {
  test("inserts the agreed row and moves last_touch_at forward", async () => {
    const c = partnerCard();
    const w = world([c]);
    const res = await partnerInteractionApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    const row = strip(w.db.inserts[0].row);
    expect(row).toEqual({
      org_id: ORG,
      partner_id: HARBOR,
      kind: "call",
      occurred_at: "2026-10-08T12:00:00Z",
      notes: "Principal wants spring dates.",
      logged_by: "remi",
      external_source: "capture",
      external_id: c.id,
    });
    expect(res.table).toBe("partner_interactions");
    expect(w.db.tables.partners[0].last_touch_at).toBe("2026-10-08");
    expect(w.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "capture.partner_interaction.create" }));
  });

  test("never moves last_touch_at backwards", async () => {
    const c = partnerCard();
    const w = world([c]);
    w.db.tables.partners[0].last_touch_at = "2026-10-09";
    await partnerInteractionApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    expect(w.db.tables.partners[0].last_touch_at).toBe("2026-10-09");
  });

  test("lookup returns the existing row; RLS denial is a 403 naming partner records", async () => {
    const c = partnerCard();
    const w = world([c]);
    const a = await partnerInteractionApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    const b = await partnerInteractionApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    expect(b.id).toBe(a.id);
    expect(w.db.tables.partner_interactions).toHaveLength(1);

    const denied = world([c], { db: { denyInsert: new Set(["partner_interactions"]) } });
    await rejects(partnerInteractionApplier.apply(denied.deps.supabase, denied.deps.ctx, c, CAPTURE), 403, /partner records/);
  });
});

describe("task applier (task / thought -> ops_tasks)", () => {
  test("a task inserts the agreed row with label provenance and origin_path", async () => {
    const c = card({
      entity_type: "constituent",
      entity_id: MARISOL,
      payload: {
        title: "Send Marisol the impact one-pager",
        category: "fundraising",
        notes: "She asked twice.",
        due_date: "2026-10-16",
        assignee: { handle: "shannon", user_id: STAFF, name: "Shannon Example" },
        entity_name: "Marisol Quintero",
      },
    });
    const w = world([c]);
    const res = await taskApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    const row = strip(w.db.inserts[0].row);
    expect(row).toEqual({
      org_id: ORG,
      title: "Send Marisol the impact one-pager",
      description: "She asked twice.",
      category: "fundraising",
      created_by: "remi",
      assigned_to: "shannon",
      assigned_to_id: STAFF,
      due_date: "2026-10-16",
      linked_entity_type: "constituent",
      linked_entity_id: MARISOL,
      linked_label: "Marisol Quintero",
      labels: ["capture", `sys:ref:capture_card:${c.id}`],
      origin_path: `/admin/capture/${CAPTURE_ID}`,
    });
    expect(res.table).toBe("ops_tasks");
    expect(w.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "capture.task.create", entityType: "ops_tasks" }));
  });

  test("assignee is both-or-neither, and an unknown category falls back to other", () => {
    const c = card({ payload: { title: "Call the venue", category: "parties", assignee: { handle: "shannon" } } });
    const row = taskInsert({ orgId: ORG, userId: "u", handle: "remi", audit: async () => {} }, c, CAPTURE);
    expect(row.assigned_to).toBeNull();
    expect(row.assigned_to_id).toBeNull();
    expect(row.category).toBe("other");
  });

  test("a thought is a parking-lot task: category other, no due date, no assignee", async () => {
    const c = thoughtCard();
    const w = world([c]);
    await taskApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    const row = w.db.tables.ops_tasks[0];
    expect(row.title).toBe("What if alumni ran the spring showcase?");
    expect(row.category).toBe("other");
    expect(row.due_date).toBeNull();
    expect(row.assigned_to).toBeNull();
    expect(row.labels).toEqual(["capture", refLabel(c.id), "parking-lot"]);
    expect(w.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "capture.thought.create" }));
  });

  test("a long thought keeps its full text in description", () => {
    const text = "a".repeat(300);
    const row = taskInsert({ orgId: ORG, userId: "u", handle: "remi", audit: async () => {} }, thoughtCard({ payload: { text } }), CAPTURE);
    expect((row.title as string).length).toBe(160);
    expect(row.description).toBe(text);
  });

  test("never links a student, whatever the card claims", () => {
    const c = card({ entity_type: "student" as unknown as CardRow["entity_type"], entity_id: MARISOL });
    const row = taskInsert({ orgId: ORG, userId: "u", handle: "remi", audit: async () => {} }, c, CAPTURE);
    expect(row.linked_entity_type).toBeNull();
    expect(row.linked_entity_id).toBeNull();
  });

  test("lookup by label returns the existing row; RLS denial is a 403", async () => {
    const c = card();
    const w = world([c]);
    const a = await taskApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    const b = await taskApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    expect(b.id).toBe(a.id);
    expect(w.db.tables.ops_tasks).toHaveLength(1);

    const denied = world([c], { db: { denyInsert: new Set(["ops_tasks"]) } });
    await rejects(taskApplier.apply(denied.deps.supabase, denied.deps.ctx, c, CAPTURE), 403, /create tasks/);
  });
});

describe("draft applier (message_draft -> reed_drafts)", () => {
  test("inserts a capture_message draft with provenance in context_ref, status drafted", async () => {
    const c = draftCard();
    const w = world([c]);
    const res = await draftApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    const row = strip(w.db.inserts[0].row);
    expect(row).toEqual({
      org_id: ORG,
      kind: "capture_message",
      title: "Message to Marisol Quintero",
      body: "Hi Marisol, here are the numbers.",
      status: "drafted",
      created_by: "remi",
      model_used: "claude-sonnet-4-6",
      context_ref: {
        capture_id: CAPTURE_ID,
        capture_card_id: c.id,
        entity_type: "constituent",
        entity_id: MARISOL,
        channel: "email",
        subject: "Impact numbers",
      },
    });
    expect(res.table).toBe("reed_drafts");
    expect(w.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "capture.message_draft.create" }));
  });

  test("an unmatched draft is titled by the heard name", () => {
    const c = draftCard({ entity_type: null, entity_id: null, heard_name: "Theo", payload: { channel: "text", body: "Running late", recipient_name: null } });
    const row = draftInsert({ orgId: ORG, userId: "u", handle: "remi", audit: async () => {} }, c, CAPTURE);
    expect(row.title).toBe("Message to Theo");
  });

  test("lookup by context_ref returns the existing draft; RLS denial is a 403", async () => {
    const c = draftCard();
    const w = world([c]);
    const a = await draftApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    const b = await draftApplier.apply(w.deps.supabase, w.deps.ctx, c, CAPTURE);
    expect(b.id).toBe(a.id);
    expect(w.db.tables.reed_drafts).toHaveLength(1);

    const denied = world([c], { db: { denyInsert: new Set(["reed_drafts"]) } });
    await rejects(draftApplier.apply(denied.deps.supabase, denied.deps.ctx, c, CAPTURE), 403, /message drafts/);
  });
});

describe("applierFor", () => {
  test("routes by destination and entity; an unmatched or student interaction never applies", () => {
    expect(applierFor(interactionCard()).table).toBe("interactions");
    expect(applierFor(partnerCard()).table).toBe("partner_interactions");
    expect(applierFor(card()).table).toBe("ops_tasks");
    expect(applierFor(thoughtCard()).table).toBe("ops_tasks");
    expect(applierFor(draftCard()).table).toBe("reed_drafts");
    expect(() => applierFor(interactionCard({ entity_type: null, entity_id: null }))).toThrow(ApplyError);
    expect(() => applierFor(interactionCard({ entity_type: "student" as unknown as CardRow["entity_type"] }))).toThrow(ApplyError);
  });

  test("permissions: fundraising.write, program.write, ops.write, ops.write", () => {
    expect(applierFor(interactionCard()).permission).toBe("fundraising.write");
    expect(applierFor(partnerCard()).permission).toBe("program.write");
    expect(applierFor(card()).permission).toBe("ops.write");
    expect(applierFor(draftCard()).permission).toBe("ops.write");
  });
});
