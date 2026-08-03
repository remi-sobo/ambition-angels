/**
 * Shared-calendar dedupe for the meetings surface.
 *
 * One real meeting can be mirrored into `calendar_events` once per connected
 * user: Remi's connection syncs remi@ambitionangels.org, and Shannon's
 * connection syncs that same calendar (it's shared with her). Both mirror rows
 * carry the SAME `google_event_id` and differ only in `owner_user_id`. The
 * read policy is owner-or-grantee, so a delegate (Shannon holds a grant on
 * Remi's calendar) legitimately reads BOTH rows — and the meetings list
 * rendered each meeting twice.
 *
 * The mirror rows themselves are correct and stay put (the Agenda surface lanes
 * by owner on purpose). Lists that show "the meetings", not "the calendars",
 * collapse them back to one row per real Google event.
 *
 * Winner rule: the viewer's own copy when they have one — that keeps deep links
 * (/admin/meetings/upcoming/[eventId], agenda threads) on a row they own —
 * otherwise the lowest id, so the choice is deterministic across renders.
 * Rows with no event key (manual/uploaded meetings, unsynced bookings) are
 * never mirrors and always survive.
 */

export type MirrorRef = {
  /** Row primary key — the deterministic tiebreak. */
  id: string;
  /** Whose calendar this copy came from. */
  ownerUserId: string | null;
  /** The real event this row mirrors (google_event_id), or null if it isn't a mirror. */
  eventKey: string | null;
};

function beats(a: MirrorRef, b: MirrorRef, viewerUserId: string | null | undefined): boolean {
  const aMine = !!viewerUserId && a.ownerUserId === viewerUserId;
  const bMine = !!viewerUserId && b.ownerUserId === viewerUserId;
  if (aMine !== bMine) return aMine;
  return a.id < b.id;
}

/**
 * Drop rows that mirror a Google event another row in the list already covers.
 * Input order is preserved; nothing without an `eventKey` is ever removed.
 */
export function dedupeSharedMirrors<T>(
  rows: T[],
  ref: (row: T) => MirrorRef,
  viewerUserId: string | null | undefined
): T[] {
  const winner = new Map<string, { row: T; ref: MirrorRef }>();
  for (const row of rows) {
    const r = ref(row);
    if (!r.eventKey) continue;
    const held = winner.get(r.eventKey);
    if (!held || beats(r, held.ref, viewerUserId)) winner.set(r.eventKey, { row, ref: r });
  }
  return rows.filter((row) => {
    const key = ref(row).eventKey;
    return !key || winner.get(key)?.row === row;
  });
}
