import { describe, expect, test, vi } from "vitest";
import { fakeDb } from "./support/commsFakeDb";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));

/**
 * V4 Stage D: Talk to log's held story drafts move into the real story bank.
 * First name and last initial only, participant subject with no consent (so
 * the story is held everywhere), raw status, and each move happens once.
 */

const ORG = "00000000-0000-0000-0000-00000000000a";

describe("fileStory", async () => {
  const { fileStory, moveKeptStoryDrafts } = await import("@/lib/admin/comms/capture-server");
  const { storyVerdicts } = await import("@/lib/comms/story-gate");

  test("an identifiable story files raw with a shortened participant label and no consent, so it is held", async () => {
    const db = fakeDb({});
    const r = await fileStory(db.client, ORG, { body: "Jaylen practiced with two Northgate staff. They asked him back.", about: "Jaylen Moore", identifiable: true, capturedBy: "priya", source: "manual" });
    expect(r.ok).toBe(true);
    const story = db.tables.stories[0];
    expect(story).toMatchObject({ org_id: ORG, status: "raw", captured_by: "priya" });
    expect(String(story.title)).toMatch(/^Jaylen practiced/);
    expect(db.tables.story_subjects[0]).toMatchObject({ subject_type: "participant", display_label: "Jaylen M.", is_minor: true });
    expect(JSON.stringify(db.tables)).not.toContain("Moore");
    expect(db.tables.story_consents ?? []).toEqual([]);
    // Even once approved, it stays held until consent is on file.
    story.status = "approved";
    const v = await storyVerdicts(db.client, ORG, [story.id as string]);
    expect(v.get(story.id as string)?.publishable).toBe(false);
  });

  test("unsure is identifiable: anything but an explicit false files a participant", async () => {
    const db = fakeDb({});
    await fileStory(db.client, ORG, { body: "Someone did something great.", identifiable: undefined, capturedBy: null, source: "reed" });
    expect(db.tables.story_subjects[0]).toMatchObject({ subject_type: "participant", display_label: "a participant" });
  });

  test("'No one identifiable' is recorded as an explicit none subject", async () => {
    const db = fakeDb({});
    await fileStory(db.client, ORG, { body: "The whole group cheered.", identifiable: false, capturedBy: null, source: "manual" });
    expect(db.tables.story_subjects[0]).toMatchObject({ subject_type: "none" });
  });

  test("'Request consent' records the ask only (pending never publishes); nothing is sent", async () => {
    const db = fakeDb({});
    await fileStory(db.client, ORG, { body: "Sofia built a budget.", about: "Sofia Perez", identifiable: true, requestConsent: true, capturedBy: null, source: "manual" });
    expect(db.tables.story_consents[0]).toMatchObject({ scope: ["first_name", "quote"] });
    expect(db.tables.story_consents[0].granted_at ?? null).toBeNull();
    expect(db.tables.story_consents[0].requested_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("if the subject row fails, the story is taken back out (never a story about nobody)", async () => {
    const db = fakeDb({}, { failWrite: ["story_subjects"] });
    const r = await fileStory(db.client, ORG, { body: "x happened", identifiable: true, capturedBy: null, source: "manual" });
    expect(r.ok).toBe(false);
    expect(db.tables.stories).toEqual([]);
  });

  test("the kept Stage C drafts move in once; held, undecided cards stay put", async () => {
    const kept = { id: "k1", org_id: ORG, status: "confirmed", payload: { card_kind: "story", text: "Her tour guide started a robotics club.", about: "Jaylen M.", identifiable: true, filed: { table: "capture_cards", kept: true } } };
    const held = { id: "h1", org_id: ORG, status: "held", payload: { card_kind: "story", text: "Held one.", identifiable: true } };
    const other = { id: "o1", org_id: "00000000-0000-0000-0000-00000000000b", status: "confirmed", payload: { ...kept.payload } };
    const db = fakeDb({ capture_cards: [kept, held, other] });
    const first = await moveKeptStoryDrafts(db.client, ORG, "remi");
    expect(first).toEqual({ moved: 1, failed: 0 });
    expect(db.tables.stories).toHaveLength(1);
    expect(db.tables.stories[0]).toMatchObject({ org_id: ORG, source: "reed", status: "raw" });
    expect((db.tables.capture_cards[0].payload as { filed: unknown }).filed).toEqual({ table: "stories", id: db.tables.stories[0].id });
    const again = await moveKeptStoryDrafts(db.client, ORG, "remi");
    expect(again).toEqual({ moved: 0, failed: 0 });
  });
});

describe("keepStory on a Talk to log card", async () => {
  const { keepStory } = await import("@/lib/capture/v4Cards");
  const card = { id: "card-s", capture_id: "cap", org_id: ORG, dest: "thought", status: "held", payload: { card_kind: "story", text: "Jaylen asked for a job.", about: "Jaylen M.", identifiable: true }, position: 1, entity_type: null, entity_id: null, match_candidates: [] };
  const deps = (db: ReturnType<typeof fakeDb>) => ({ supabase: db.client, ctx: { orgId: ORG, userId: "u1", handle: "remi", audit: async () => {} }, hasPermission: async () => true });

  test("with Comms it files into the story bank and marks the card filed there", async () => {
    const db = fakeDb({ capture_cards: [{ ...card }], captures: [{ id: "cap", status: "ready" }] });
    const filer = vi.fn(async () => ({ ok: true as const, storyId: "story-1" }));
    const r = await keepStory(deps(db) as never, "card-s", filer);
    expect(r.ok).toBe(true);
    expect(filer).toHaveBeenCalledWith({ title: null, text: "Jaylen asked for a job.", about: "Jaylen M.", identifiable: true });
    expect((db.tables.capture_cards[0].payload as { filed: unknown }).filed).toEqual({ table: "stories", id: "story-1" });
  });

  test("without Comms the card stays the held draft, as in Stage C", async () => {
    const db = fakeDb({ capture_cards: [{ ...card }], captures: [{ id: "cap", status: "ready" }] });
    const r = await keepStory(deps(db) as never, "card-s");
    expect(r.ok).toBe(true);
    expect((db.tables.capture_cards[0].payload as { filed: unknown }).filed).toEqual({ table: "capture_cards", kept: true });
  });
});
