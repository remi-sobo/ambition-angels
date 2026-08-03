import { describe, expect, test } from "vitest";
import { dedupeSharedMirrors, type MirrorRef } from "@/lib/meetings/dedupe";

// A calendar shared with a second connected user mirrors every event once per
// owner (calendar_events is keyed on owner_user_id + google_event_id). A
// delegate reads both copies through RLS, so the meetings list has to collapse
// them back to one row per real Google event.

type Row = { id: string; owner: string | null; gid: string | null };
const REMI = "remi-uuid";
const SHANNON = "shannon-uuid";

const ref = (r: Row): MirrorRef => ({ id: r.id, ownerUserId: r.owner, eventKey: r.gid });
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("dedupeSharedMirrors", () => {
  test("collapses the same google event mirrored onto two calendars", () => {
    const rows: Row[] = [
      { id: "a", owner: REMI, gid: "evt1" },
      { id: "b", owner: SHANNON, gid: "evt1" },
    ];
    expect(ids(dedupeSharedMirrors(rows, ref, SHANNON))).toEqual(["b"]);
    expect(ids(dedupeSharedMirrors(rows, ref, REMI))).toEqual(["a"]);
  });

  test("keeps the viewer's own copy even when it sorts later", () => {
    const rows: Row[] = [
      { id: "zzz", owner: SHANNON, gid: "evt1" },
      { id: "aaa", owner: REMI, gid: "evt1" },
    ];
    expect(ids(dedupeSharedMirrors(rows, ref, SHANNON))).toEqual(["zzz"]);
  });

  test("deterministic when the viewer owns neither copy", () => {
    const rows: Row[] = [
      { id: "b", owner: REMI, gid: "evt1" },
      { id: "a", owner: SHANNON, gid: "evt1" },
    ];
    const out = ids(dedupeSharedMirrors(rows, ref, "someone-else"));
    expect(out).toEqual(["a"]);
    expect(ids(dedupeSharedMirrors([...rows].reverse(), ref, "someone-else"))).toEqual(out);
    expect(ids(dedupeSharedMirrors(rows, ref, null))).toEqual(out);
  });

  test("distinct events all survive, in input order", () => {
    const rows: Row[] = [
      { id: "a", owner: REMI, gid: "evt1" },
      { id: "b", owner: REMI, gid: "evt2" },
      { id: "c", owner: SHANNON, gid: "evt1" },
      { id: "d", owner: SHANNON, gid: "evt3" },
    ];
    expect(ids(dedupeSharedMirrors(rows, ref, REMI))).toEqual(["a", "b", "d"]);
  });

  test("recurring instances are separate meetings, not mirrors", () => {
    // singleEvents: true gives every occurrence its own google_event_id.
    const rows: Row[] = [
      { id: "a", owner: REMI, gid: "series_20260804T150000Z" },
      { id: "b", owner: REMI, gid: "series_20260811T150000Z" },
    ];
    expect(ids(dedupeSharedMirrors(rows, ref, REMI))).toEqual(["a", "b"]);
  });

  test("rows with no event key (manual, uploaded, unsynced) are never dropped", () => {
    const rows: Row[] = [
      { id: "a", owner: REMI, gid: null },
      { id: "b", owner: SHANNON, gid: null },
      { id: "c", owner: REMI, gid: "evt1" },
      { id: "d", owner: SHANNON, gid: "evt1" },
    ];
    expect(ids(dedupeSharedMirrors(rows, ref, REMI))).toEqual(["a", "b", "c"]);
  });

  test("a lone copy survives regardless of who owns it", () => {
    const rows: Row[] = [{ id: "a", owner: REMI, gid: "evt1" }];
    expect(ids(dedupeSharedMirrors(rows, ref, SHANNON))).toEqual(["a"]);
    expect(dedupeSharedMirrors([], ref, SHANNON)).toEqual([]);
  });
});
