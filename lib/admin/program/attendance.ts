/**
 * Phone attendance rules (V4 Stage E, spec §9 "2 taps to the roster, 1 tap
 * per exception, works offline and says so"; prototype AttendancePhone.dc.html).
 *
 * PURE: shared by the session screen, the batch route and the tests.
 *
 *  - Everyone defaults to present. A row nobody tapped shows "present"
 *    (assumed) and is saved as present when the session is saved.
 *  - One tap per exception: late, absent or excused. Tapping the active
 *    exception again goes back to present.
 *  - Last write per participant and session wins, by the time of the tap
 *    (resolveLastWrite), so a queued mark from a phone that was offline never
 *    overwrites a newer mark taken on another device.
 */

export const MARK_STATUSES = ["present", "late", "absent", "excused"] as const;
export type MarkStatus = (typeof MARK_STATUSES)[number];

export function isMarkStatus(v: unknown): v is MarkStatus {
  return typeof v === "string" && (MARK_STATUSES as readonly string[]).includes(v);
}

export const MARK_LABELS: Record<MarkStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

/** What a row shows: the tap on this phone, else the saved mark, else present (assumed). */
export function effectiveStatus(
  saved: MarkStatus | null | undefined,
  local: MarkStatus | null | undefined,
): { status: MarkStatus; assumed: boolean } {
  if (local) return { status: local, assumed: false };
  if (saved) return { status: saved, assumed: false };
  return { status: "present", assumed: true };
}

/** The tap rule: a tap on the active status returns to present; otherwise it sets the tapped status. */
export function nextStatusForTap(current: MarkStatus, tapped: MarkStatus): MarkStatus {
  return current === tapped && tapped !== "present" ? "present" : tapped;
}

export type RosterEntryLite = { participantId: string; saved: MarkStatus | null };

export type AttendanceCounts = {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Rows nobody marked: they count as present when the session is saved. */
  assumed: number;
  /** Rows with a real mark (saved or tapped). */
  marked: number;
  /** Here = present + late, assumed included. */
  here: number;
};

export function attendanceCounts(
  roster: RosterEntryLite[],
  local: Record<string, MarkStatus | undefined>,
): AttendanceCounts {
  const c: AttendanceCounts = { total: roster.length, present: 0, late: 0, absent: 0, excused: 0, assumed: 0, marked: 0, here: 0 };
  for (const r of roster) {
    const e = effectiveStatus(r.saved, local[r.participantId]);
    c[e.status]++;
    if (e.assumed) c.assumed++;
    else c.marked++;
    if (e.status === "present" || e.status === "late") c.here++;
  }
  return c;
}

/**
 * The marks Save sends: every row gets one. Tapped rows send their tap;
 * saved rows resend nothing unless tapped; unmarked rows send present.
 */
export function marksToSave(
  roster: RosterEntryLite[],
  local: Record<string, MarkStatus | undefined>,
): { participantId: string; status: MarkStatus }[] {
  const out: { participantId: string; status: MarkStatus }[] = [];
  for (const r of roster) {
    const tapped = local[r.participantId];
    if (tapped && tapped !== r.saved) out.push({ participantId: r.participantId, status: tapped });
    else if (!tapped && !r.saved) out.push({ participantId: r.participantId, status: "present" });
  }
  return out;
}

/**
 * Last write wins, by the tap time. `existing` maps participant → the
 * recorded_at of the mark already stored. An incoming mark older than the
 * stored one is stale and skipped. Tap times in the future (a fast phone
 * clock) are clamped to the server's now; unparseable times become now.
 */
export function resolveLastWrite<T extends { participantId: string; at: string }>(
  incoming: T[],
  existing: Map<string, string>,
  nowISO: string,
): { apply: (T & { at: string })[]; stale: T[] } {
  const now = Date.parse(nowISO);
  // Within one batch the last tap for a participant wins too.
  const latest = new Map<string, T & { at: string }>();
  for (const m of incoming) {
    const t = Date.parse(m.at);
    const at = Number.isFinite(t) && t <= now ? new Date(t).toISOString() : new Date(now).toISOString();
    const prev = latest.get(m.participantId);
    if (!prev || Date.parse(prev.at) <= Date.parse(at)) latest.set(m.participantId, { ...m, at });
  }
  const apply: (T & { at: string })[] = [];
  const stale: T[] = [];
  latest.forEach((m) => {
    const have = existing.get(m.participantId);
    if (have && Date.parse(have) > Date.parse(m.at)) stale.push(m);
    else apply.push(m);
  });
  return { apply, stale };
}
