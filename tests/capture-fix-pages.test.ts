import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OWNER, STAFF, T0, interactionCard, world, type World } from "./support/captureWorld";

// Capture C6: history rows show where they came from, and only the person
// who recorded a note gets Fix. Pages are checked at the source; the loader
// runs against the RLS-ish fake.

let w: World;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => w.db.client }));

import { loadFixTargets } from "@/app/admin/capture/_lib/fixTargets";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const DAY = 86_400_000;

describe("loadFixTargets", () => {
  test("only the viewer's own filed cards, keyed by card id, with the source sentence", async () => {
    const mine = interactionCard({ status: "confirmed", payload: { kind: "note", source_sentence: "Coffee with Marisol." } });
    const theirs = interactionCard({ status: "confirmed", created_by: STAFF });
    const pending = interactionCard({ status: "proposed" });
    w = world([mine, theirs, pending], { userId: OWNER });
    const rows = [mine, theirs, pending].map((c) => ({ external_source: "capture", external_id: c.id }));
    rows.push({ external_source: "gmail", external_id: mine.id });

    const out = await loadFixTargets(rows, new Date(T0));
    expect(Object.keys(out)).toEqual([mine.id]);
    expect(out[mine.id]).toEqual({ cardId: mine.id, captureId: mine.capture_id, sourceSentence: "Coffee with Marisol.", transcriptCleared: false });
  });

  test("no capture rows means no query; a purged card says its transcript was cleared", async () => {
    w = world([]);
    expect(await loadFixTargets([{ external_source: "manual", external_id: null }])).toEqual({});

    const old = interactionCard({ status: "confirmed", payload: { kind: "note" }, created_at: new Date(T0 - 100 * DAY).toISOString() });
    const fresh = interactionCard({ status: "confirmed", payload: { kind: "note" }, created_at: new Date(T0 - 5 * DAY).toISOString() });
    w = world([old, fresh]);
    const out = await loadFixTargets(
      [old, fresh].map((c) => ({ external_source: "capture", external_id: c.id })),
      new Date(T0),
    );
    expect(out[old.id].transcriptCleared).toBe(true);
    expect(out[fresh.id]).toMatchObject({ sourceSentence: null, transcriptCleared: false });
  });
});

describe("page wiring", () => {
  test("the loader reads capture_cards through the session client only", () => {
    const src = read("app", "admin", "capture", "_lib", "fixTargets.ts");
    expect(src).toMatch(/import "server-only"/);
    expect(src).toMatch(/createServerSupabase\(\)/);
    expect(src).not.toMatch(/getSupabaseAdmin|lib\/supabase\/admin/);
    expect(src).toMatch(/\.eq\("status", "confirmed"\)/);
  });

  for (const [label, file, entityType] of [
    ["donor profile", "app/admin/fundraising/donors/[id]/DonorProfile.tsx", "constituent"],
    ["partner profile", "app/admin/partners/[id]/page.tsx", "partner"],
  ] as const) {
    test(`${label}: selects provenance and the stamp, shows the line on capture rows, Fix behind ai.capture`, () => {
      const src = read(file);
      expect(src).toMatch(/external_source, external_id, edited_at/);
      expect(src).toMatch(/captureEnabled \? await loadFixTargets\(interactions\) : \{\}/);
      expect(src).toMatch(/i\.external_source === "capture" && \(\s*<FiledNoteLine/);
      expect(src).toContain(`entityType: "${entityType}"`);
    });
  }

  test("the line and the sheet talk only to the card route", () => {
    const line = read("app", "admin", "capture", "_components", "FiledNoteLine.tsx");
    const sheet = read("app", "admin", "capture", "_components", "FixSheet.tsx");
    expect(line).toContain("From a voice note");
    expect(line).toMatch(/\{target && \(/);
    expect(sheet).toMatch(/fixFiled\(target\.cardId/);
    expect(sheet).toMatch(/searchCandidates\(term, note\.entityType\)/);
    expect(read("app", "admin", "capture", "_lib", "captureApi.ts")).toMatch(/fixFiled[\s\S]*\/api\/admin\/capture\/cards\/\$\{id\}/);
  });
});
