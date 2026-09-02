/**
 * Pure helpers for the week grid (/admin/calendar) — free of server imports,
 * they ship in the client bundle. Geometry, minute formatting, and the overlap
 * lane layout live here so the grid component stays about interaction and the
 * math stays unit-testable (tests/week-grid.test.ts).
 *
 * All times on the grid are minutes from local midnight in the org timezone;
 * the single DST-sensitive day↔instant conversion stays server-side in
 * dayStartInstant() (lib/admin/ops/week.ts).
 */

/** Pixel height of one hour on the grid. */
export const HOUR_PX = 52;
export const PX_PER_MIN = HOUR_PX / 60;
/** Drag/create snap, in minutes. */
export const SNAP_MIN = 15;

/** Round to the nearest snap increment. */
export function snapMin(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

export function clampMin(min: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, min));
}

/** "9:00" / "12:30" — hour clock, no meridiem. */
function clock(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const m = min % 60;
  return m === 0 ? String(h) : `${h}:${String(m).padStart(2, "0")}`;
}

function meridiem(min: number): "AM" | "PM" {
  return Math.floor(min / 60) % 24 < 12 ? "AM" : "PM";
}

/** "9 AM", "12:30 PM" — a single minute-of-day as a clock label. */
export function formatMinute(min: number): string {
  return `${clock(min)} ${meridiem(min)}`;
}

/** "9 – 10:30 AM" / "11:30 AM – 1 PM" — drops the meridiem the ends share. */
export function formatMinuteRange(startMin: number, endMin: number): string {
  const sM = meridiem(startMin);
  const eM = meridiem(endMin);
  if (sM === eM) return `${clock(startMin)} – ${clock(endMin)} ${eM}`;
  return `${clock(startMin)} ${sM} – ${clock(endMin)} ${eM}`;
}

/** "45m" / "1h" / "1h 30m" */
export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Overlap lane layout ─────────────────────────────────────────────────────
// Google-calendar-lite: walk the day's items sorted by start, group transitive
// overlaps into clusters, then greedily assign lanes inside each cluster.
// Every item in a cluster gets equal width (1/lanes of the column).

export type LaneItem = { startMin: number; endMin: number };
export type LanePlacement = { lane: number; lanes: number };

export function layoutLanes<T extends LaneItem>(items: T[]): Map<T, LanePlacement> {
  const placed = new Map<T, LanePlacement>();
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin
  );

  let cluster: { item: T; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = laneEnds.length || 1;
    for (const c of cluster) placed.set(c.item, { lane: c.lane, lanes });
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMin);
    } else {
      laneEnds[lane] = item.endMin;
    }
    cluster.push({ item, lane });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();
  return placed;
}

// ── Grid item shapes shared by server assembly and the client component ─────

/** A meeting (google/booking) projected onto one grid day. Read-only context. */
export type GridEvent = {
  id: string;
  day: string; // YYYY-MM-DD in org TZ
  startMin: number;
  endMin: number;
  title: string;
  location: string | null;
  isExternal: boolean;
  allDay: boolean;
  source: "google" | "booking" | "bloomos";
};

/** A work block row as the grid consumes it. */
export type GridBlock = {
  id: string;
  day: string;
  startMin: number;
  endMin: number;
  title: string;
  synced: boolean; // has a Google event behind it
};

/** A checklist entry on a block (ops_task projection). */
export type GridBlockTask = {
  linkId: string;
  blockId: string;
  taskId: string;
  position: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string | null;
};

/** An open gap within working hours, per day. */
export type GridOpenGap = { day: string; startMin: number; endMin: number };
