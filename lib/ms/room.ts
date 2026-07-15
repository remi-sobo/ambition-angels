/**
 * Table assignment with career dedup (D5). With a small catalog, two
 * students at one table can land the same career, and a round where the
 * table just heard the job three minutes ago is dead. So the room assigns:
 * walk each table, give each student the highest-ranked career from their
 * OWN list that nobody else at that table already has — four students,
 * four distinct careers, every one still a personal match.
 *
 * Preference order per student:
 *   1. highest-ranked, not taken at this table, not already explored
 *      (fast finishers played solo cards while waiting — don't hand them a
 *      card whose answer they have already seen);
 *   2. highest-ranked, not taken at this table;
 *   3. highest-ranked outright (tiny catalog, duplicate unavoidable — the
 *      round still runs, it is just softer).
 *
 * Deterministic given the rng, which the tests inject.
 */

export type RoomStudent = {
  sessionId: string;
  handle: string;
  /** soc codes in the student's personal rank order */
  ranked: string[];
  /** soc codes whose answer this student has already seen */
  explored: string[];
};

export type TableAssignment = {
  n: number;
  members: { sessionId: string; handle: string; socCode: string }[];
};

export const TABLE_SIZE = 4;

/** Fisher–Yates with an injectable rng so tests are exact. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function assignTables(
  students: RoomStudent[],
  opts: { tableSize?: number; rng?: () => number } = {}
): TableAssignment[] {
  const tableSize = opts.tableSize ?? TABLE_SIZE;
  const shuffled = shuffle(students, opts.rng);

  // Random tables, never by interest (spec: "Not by interest. Never by
  // interest."). A remainder of 1 would leave a kid alone, so the last two
  // tables even out to 3+2 instead of 4+1.
  const tables: RoomStudent[][] = [];
  for (let i = 0; i < shuffled.length; i += tableSize) {
    tables.push(shuffled.slice(i, i + tableSize));
  }
  if (tables.length >= 2 && tables[tables.length - 1].length === 1) {
    const last = tables.pop()!;
    const prev = tables[tables.length - 1];
    tables[tables.length - 1] = prev.slice(0, prev.length - 1);
    tables.push([prev[prev.length - 1], ...last]);
  }

  return tables.map((members, idx) => {
    const taken = new Set<string>();
    const assigned = members.map((student) => {
      const explored = new Set(student.explored);
      const pick =
        student.ranked.find((soc) => !taken.has(soc) && !explored.has(soc)) ??
        student.ranked.find((soc) => !taken.has(soc)) ??
        student.ranked[0];
      if (pick) taken.add(pick);
      return { sessionId: student.sessionId, handle: student.handle, socCode: pick ?? "" };
    });
    return { n: idx + 1, members: assigned };
  });
}
