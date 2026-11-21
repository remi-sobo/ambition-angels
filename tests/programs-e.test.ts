import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "./support/fakeDb";
import {
  attendanceCounts,
  effectiveStatus,
  marksToSave,
  nextStatusForTap,
  resolveLastWrite,
} from "@/lib/admin/program/attendance";
import {
  enqueue,
  flush,
  memoryStore,
  pendingMarks,
  toPendingMark,
  type PendingMark,
} from "@/lib/admin/program/attendanceQueue";
import {
  ROSTER_TABLE,
  buildRosterRows,
  filterRoster,
  pageRoster,
  parseRosterFilters,
  rosterFilterParams,
  rosterHref,
  sortRoster,
} from "@/lib/admin/program/roster";
import { parseTableState } from "@/lib/admin/dataTable";
import { parseEnrollBody, planEnrollment } from "@/lib/admin/program/enroll";
import { buildRow, cohortLookup, suggestMapping } from "@/lib/admin/imports/engine";
import { coachMatchProgress } from "@/lib/admin/program/coachRoster";
import { cohortNextStep } from "@/lib/admin/program/cohortDetail";

/**
 * V4 Stage E (Programs): bulk enroll and batch attendance route fences, the
 * offline queue's rules, attendance defaults and counts, roster URL state,
 * the import cohort column, and the coach and cohort next steps.
 */

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const ME = "11111111-1111-4111-8111-111111111111";
const COHORT_A = "c0000000-0000-4000-8000-00000000000a";
const COHORT_A_ARCHIVED = "c0000000-0000-4000-8000-0000000000aa";
const COHORT_B = "c0000000-0000-4000-8000-00000000000b";
const P1 = "a1000000-0000-4000-8000-000000000001";
const P2 = "a1000000-0000-4000-8000-000000000002";
const P3 = "a1000000-0000-4000-8000-000000000003"; // dropped from COHORT_A
const PB = "b1000000-0000-4000-8000-000000000001"; // org B participant
const SESSION_A = "5e000000-0000-4000-8000-00000000000a";
const SESSION_B = "5e000000-0000-4000-8000-00000000000b";

const ctxFor = (orgId: string) => ({ userId: ME, email: "me@example.org", orgId, orgName: "Org", role: "staff" as const });

let db: FakeDb;
let ctx: ReturnType<typeof ctxFor> | null = ctxFor(ORG_A);
let perms = new Set<string>(["program.write", "program.read"]);
const auditSpy = vi.fn(async () => {});

vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>();
  return { ...mod, cache: <T,>(fn: T) => fn };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => db.client }));
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => auditSpy(...(a as [])) }));
vi.mock("@/lib/admin/auth", () => ({
  getOrgContext: vi.fn(async () => ctx),
  ctxHasPermission: vi.fn(async (_c: unknown, p: string) => perms.has(p)),
  isAuthed: vi.fn(async () => !!ctx),
  getAdminUser: vi.fn(async () => "Me"),
}));

import { POST as enrollRoute } from "@/app/api/admin/programs/enroll/route";
import { POST as batchRoute } from "@/app/api/admin/sessions/[id]/attendance/batch/route";

beforeEach(() => {
  ctx = ctxFor(ORG_A);
  perms = new Set(["program.write", "program.read"]);
  auditSpy.mockClear();
  db = fakeDb(
    {
      cohorts: [
        { id: COHORT_A, org_id: ORG_A, name: "Fall Group A", status: "active" },
        { id: COHORT_A_ARCHIVED, org_id: ORG_A, name: "Old group", status: "archived" },
        { id: COHORT_B, org_id: ORG_B, name: "Other org group", status: "active" },
      ],
      students: [
        { id: P1, org_id: ORG_A, first_name: "Avery" },
        { id: P2, org_id: ORG_A, first_name: "Blake" },
        { id: P3, org_id: ORG_A, first_name: "Casey" },
        { id: PB, org_id: ORG_B, first_name: "Drew" },
      ],
      cohort_members: [
        { id: "m3", org_id: ORG_A, cohort_id: COHORT_A, student_id: P3, status: "dropped", ended_on: "2026-10-01" },
      ],
      cohort_sessions: [
        { id: SESSION_A, org_id: ORG_A, cohort_id: COHORT_A, session_date: "2026-11-20", status: "scheduled" },
        { id: SESSION_B, org_id: ORG_B, cohort_id: COHORT_B, session_date: "2026-11-20", status: "scheduled" },
      ],
      attendance: [],
    },
    { unique: { cohort_members: [["cohort_id", "student_id"]], attendance: [["session_id", "student_id"]] } },
  );
});

const enroll = (body: unknown) =>
  enrollRoute(new NextRequest("http://localhost/api/admin/programs/enroll", { method: "POST", body: JSON.stringify(body) }));
const batch = (sessionId: string, marks: unknown[]) =>
  batchRoute(
    new NextRequest(`http://localhost/api/admin/sessions/${sessionId}/attendance/batch`, {
      method: "POST",
      body: JSON.stringify({ marks }),
    }),
    { params: { id: sessionId } },
  );
const members = (cohort = COHORT_A) => db.tables.cohort_members.filter((m) => m.cohort_id === cohort);

describe("POST /api/admin/programs/enroll (bulk enroll)", () => {
  test("enrolls the selected people in a cohort of the active org, pinned to that org", async () => {
    const res = await enroll({ ids: [P1, P2], cohort_id: COHORT_A });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, added: 2, reenrolled: 0, already: 0, skipped: 0 });
    const rows = members().filter((m) => m.student_id !== P3);
    expect(rows.map((m) => m.student_id).sort()).toEqual([P1, P2]);
    expect(rows.every((m) => m.org_id === ORG_A && m.status === "enrolled")).toBe(true);
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });

  test("needs program.write (403), a session (401) and valid input (400)", async () => {
    perms = new Set(["program.read"]);
    expect((await enroll({ ids: [P1], cohort_id: COHORT_A })).status).toBe(403);
    ctx = null;
    expect((await enroll({ ids: [P1], cohort_id: COHORT_A })).status).toBe(401);
    ctx = ctxFor(ORG_A);
    perms = new Set(["program.write"]);
    expect((await enroll({ ids: [], cohort_id: COHORT_A })).status).toBe(400);
    expect((await enroll({ ids: ["nope"], cohort_id: COHORT_A })).status).toBe(400);
    expect((await enroll({ ids: [P1], cohort_id: "x" })).status).toBe(400);
    expect(members().length).toBe(1);
  });

  test("a cohort in another org is refused (404) and nothing is written", async () => {
    const res = await enroll({ ids: [P1], cohort_id: COHORT_B });
    expect(res.status).toBe(404);
    expect(db.tables.cohort_members.length).toBe(1);
  });

  test("an archived cohort is refused (409)", async () => {
    expect((await enroll({ ids: [P1], cohort_id: COHORT_A_ARCHIVED })).status).toBe(409);
  });

  test("a participant from another org is skipped, never enrolled; only foreign ids is a 404", async () => {
    const res = await enroll({ ids: [P1, PB], cohort_id: COHORT_A });
    expect(await res.json()).toMatchObject({ added: 1, skipped: 1 });
    expect(db.tables.cohort_members.some((m) => m.student_id === PB)).toBe(false);
    expect((await enroll({ ids: [PB], cohort_id: COHORT_A })).status).toBe(404);
  });

  test("idempotent: the same request twice changes nothing the second time; dropped members re-enroll", async () => {
    const first = await (await enroll({ ids: [P1, P3], cohort_id: COHORT_A })).json();
    expect(first).toMatchObject({ added: 1, reenrolled: 1, already: 0 });
    expect(members().find((m) => m.student_id === P3)).toMatchObject({ status: "enrolled", ended_on: null });
    const before = JSON.stringify(db.tables.cohort_members);
    const second = await (await enroll({ ids: [P1, P3], cohort_id: COHORT_A })).json();
    expect(second).toMatchObject({ added: 0, reenrolled: 0, already: 2 });
    expect(JSON.stringify(db.tables.cohort_members)).toBe(before);
    // No write, no audit row for a no-op.
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });

  test("planEnrollment and parseEnrollBody (pure)", () => {
    const plan = planEnrollment([P1, P2, P3, PB, P1], [P1, P2, P3], [
      { id: "m2", student_id: P2, status: "completed" },
      { id: "m3", student_id: P3, status: "dropped" },
    ]);
    expect(plan).toMatchObject({ insert: [P1], reenroll: ["m3"], already: 1, skipped: 1, inOrg: 3 });
    expect(parseEnrollBody({ ids: [P1, P1.toUpperCase()], cohort_id: COHORT_A })).toEqual({ ok: true, ids: [P1], cohortId: COHORT_A });
    expect(parseEnrollBody({ ids: Array.from({ length: 201 }, (_, i) => `a1000000-0000-4000-8000-${String(i).padStart(12, "0")}`), cohort_id: COHORT_A }).ok).toBe(false);
  });
});

describe("POST /api/admin/sessions/[id]/attendance/batch", () => {
  beforeEach(() => {
    db.tables.cohort_members.push(
      { id: "m1", org_id: ORG_A, cohort_id: COHORT_A, student_id: P1, status: "enrolled" },
      { id: "m2", org_id: ORG_A, cohort_id: COHORT_A, student_id: P2, status: "enrolled" },
    );
  });

  test("saves marks for enrolled members, marks the session held, pinned to the org", async () => {
    const res = await batch(SESSION_A, [
      { student_id: P1, status: "present", at: "2026-11-20T23:00:00.000Z" },
      { student_id: P2, status: "absent", at: "2026-11-20T23:00:01.000Z" },
    ]);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: 2, stale: 0, rejected: 0 });
    expect(db.tables.attendance.map((a) => [a.student_id, a.status, a.org_id])).toEqual([
      [P1, "present", ORG_A],
      [P2, "absent", ORG_A],
    ]);
    expect(db.tables.cohort_sessions.find((s) => s.id === SESSION_A)!.status).toBe("held");
  });

  test("needs program.write; a session in another org is a 404", async () => {
    perms = new Set(["program.read"]);
    expect((await batch(SESSION_A, [{ student_id: P1, status: "present" }])).status).toBe(403);
    perms = new Set(["program.write"]);
    expect((await batch(SESSION_B, [{ student_id: PB, status: "present" }])).status).toBe(404);
    expect(db.tables.attendance.length).toBe(0);
  });

  test("people not enrolled in the session's cohort are rejected (409 when nobody is left)", async () => {
    const res = await batch(SESSION_A, [{ student_id: PB, status: "present", at: "2026-11-20T23:00:00Z" }]);
    expect(res.status).toBe(409);
    const mixed = await (await batch(SESSION_A, [
      { student_id: P1, status: "late", at: "2026-11-20T23:00:00Z" },
      { student_id: PB, status: "present", at: "2026-11-20T23:00:00Z" },
    ])).json();
    expect(mixed).toMatchObject({ applied: 1, rejected: 1 });
    expect(db.tables.attendance.some((a) => a.student_id === PB)).toBe(false);
  });

  test("last write wins by tap time: an older queued mark never overwrites a newer one; resending is idempotent", async () => {
    await batch(SESSION_A, [{ student_id: P1, status: "absent", at: "2026-11-20T23:10:00.000Z" }]);
    const stale = await (await batch(SESSION_A, [{ student_id: P1, status: "present", at: "2026-11-20T23:05:00.000Z" }])).json();
    expect(stale).toMatchObject({ applied: 0, stale: 1 });
    expect(db.tables.attendance.find((a) => a.student_id === P1)!.status).toBe("absent");
    const again = await (await batch(SESSION_A, [{ student_id: P1, status: "absent", at: "2026-11-20T23:10:00.000Z" }])).json();
    expect(again).toMatchObject({ applied: 1, stale: 0 });
    expect(db.tables.attendance.filter((a) => a.student_id === P1).length).toBe(1);
  });

  test("bad marks are a 400", async () => {
    expect((await batch(SESSION_A, [])).status).toBe(400);
    expect((await batch(SESSION_A, [{ student_id: P1, status: "here" }])).status).toBe(400);
  });
});

describe("offline queue (pending marks only)", () => {
  const S = SESSION_A;
  const mark = (participantId: string, status: string, at: string) => ({ sessionId: S, participantId, status, at });

  test("holds exactly session, participant, status and time: names and roster fields are dropped", async () => {
    const q = memoryStore();
    await enqueue(q, { ...mark(P1, "absent", "2026-11-20T23:00:00Z"), name: "Avery Example", grade: "9", roster: [P1, P2] });
    const stored = Array.from(q.raw.values());
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0]).sort()).toEqual(["at", "participantId", "sessionId", "status"]);
    expect(JSON.stringify(stored)).not.toMatch(/Avery|grade|roster/);
    expect(toPendingMark({ sessionId: "x", participantId: P1, status: "absent" })).toBeNull();
    expect(toPendingMark({ sessionId: S, participantId: P1, status: "here" })).toBeNull();
  });

  test("dedupes per session and participant: the newest tap is the one that waits", async () => {
    const q = memoryStore();
    await enqueue(q, mark(P1, "late", "2026-11-20T23:00:00Z"));
    await enqueue(q, mark(P1, "absent", "2026-11-20T23:00:05Z"));
    await enqueue(q, mark(P2, "excused", "2026-11-20T23:00:06Z"));
    const all = await pendingMarks(q, S);
    expect(all).toHaveLength(2);
    expect(all.find((m) => m.participantId === P1)!.status).toBe("absent");
  });

  test("sync sends one batch per session and clears what the server accepted", async () => {
    const q = memoryStore();
    await enqueue(q, mark(P1, "absent", "2026-11-20T23:00:00Z"));
    await enqueue(q, { ...mark(P2, "late", "2026-11-20T23:00:00Z"), sessionId: SESSION_B });
    const calls: [string, PendingMark[]][] = [];
    const r = await flush(q, async (sid, marks) => {
      calls.push([sid, marks]);
      return { ok: true };
    });
    expect(calls.map((c) => c[0]).sort()).toEqual([SESSION_A, SESSION_B].sort());
    expect(r).toEqual({ sent: 2, kept: 0, rejected: 0 });
    expect(await pendingMarks(q)).toHaveLength(0);
  });

  test("offline or a server error keeps the marks; a final refusal drops them and says so", async () => {
    const q = memoryStore();
    await enqueue(q, mark(P1, "absent", "2026-11-20T23:00:00Z"));
    expect(await flush(q, async () => ({ ok: false, status: null }))).toEqual({ sent: 0, kept: 1, rejected: 0 });
    expect(await flush(q, async () => { throw new TypeError("Failed to fetch"); })).toEqual({ sent: 0, kept: 1, rejected: 0 });
    expect(await flush(q, async () => ({ ok: false, status: 503 }))).toMatchObject({ kept: 1 });
    expect(await flush(q, async () => ({ ok: false, status: 401 }))).toMatchObject({ kept: 1 });
    expect(await pendingMarks(q)).toHaveLength(1);
    expect(await flush(q, async () => ({ ok: false, status: 403 }))).toEqual({ sent: 0, kept: 0, rejected: 1 });
    expect(await pendingMarks(q)).toHaveLength(0);
  });

  test("a re-tap while the request is out stays queued for the next sync", async () => {
    const q = memoryStore();
    await enqueue(q, mark(P1, "absent", "2026-11-20T23:00:00Z"));
    await flush(q, async () => {
      await enqueue(q, mark(P1, "late", "2026-11-20T23:00:09Z"));
      return { ok: true };
    });
    const left = await pendingMarks(q);
    expect(left).toHaveLength(1);
    expect(left[0].status).toBe("late");
  });

  test("logout clears the queue: clearAdminCaches deletes the queue database", async () => {
    const deleted: string[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    const prevWindow = g.window;
    const prevIdb = g.indexedDB;
    g.window = { caches: { keys: async () => [], delete: async () => true } };
    g.indexedDB = {
      deleteDatabase: (name: string) => {
        deleted.push(name);
        const req: { onsuccess?: () => void } = {};
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      },
    };
    try {
      const { clearAdminCaches } = await import("@/lib/admin/swCache");
      await clearAdminCaches();
      expect(deleted).toEqual(["bloomos-attendance-queue"]);
    } finally {
      g.window = prevWindow;
      g.indexedDB = prevIdb;
    }
  });
});

describe("attendance defaults and counts", () => {
  const roster = [
    { participantId: P1, saved: null },
    { participantId: P2, saved: "absent" as const },
    { participantId: P3, saved: null },
  ];

  test("everyone defaults to present (assumed) until marked", () => {
    expect(effectiveStatus(null, undefined)).toEqual({ status: "present", assumed: true });
    expect(effectiveStatus("absent", undefined)).toEqual({ status: "absent", assumed: false });
    expect(effectiveStatus("absent", "late")).toEqual({ status: "late", assumed: false });
  });

  test("one tap per exception; tapping the active exception goes back to present", () => {
    expect(nextStatusForTap("present", "absent")).toBe("absent");
    expect(nextStatusForTap("absent", "absent")).toBe("present");
    expect(nextStatusForTap("absent", "late")).toBe("late");
    expect(nextStatusForTap("present", "present")).toBe("present");
  });

  test("counts: assumed present rows count as here; marked counts real marks only", () => {
    const c = attendanceCounts(roster, { [P3]: "late" });
    expect(c).toMatchObject({ total: 3, present: 1, late: 1, absent: 1, assumed: 1, marked: 2, here: 2 });
  });

  test("Save sends a mark for every row not already saved, present for the untapped", () => {
    expect(marksToSave(roster, { [P3]: "excused" })).toEqual([
      { participantId: P1, status: "present" },
      { participantId: P3, status: "excused" },
    ]);
    // A tap that changes a saved mark is sent; a tap equal to it is not.
    expect(marksToSave(roster, { [P2]: "late" }).find((m) => m.participantId === P2)).toEqual({ participantId: P2, status: "late" });
    expect(marksToSave(roster, { [P2]: "absent" }).some((m) => m.participantId === P2)).toBe(false);
  });

  test("resolveLastWrite: future tap times clamp to now; the last tap in a batch wins", () => {
    const now = "2026-11-20T23:00:00.000Z";
    const r = resolveLastWrite(
      [
        { participantId: P1, at: "2026-11-21T09:00:00Z", status: "late" },
        { participantId: P2, at: "2026-11-20T22:00:00Z", status: "late" },
        { participantId: P2, at: "2026-11-20T22:30:00Z", status: "absent" },
      ],
      new Map(),
      now,
    );
    expect(r.apply.find((m) => m.participantId === P1)!.at).toBe(now);
    expect(r.apply.find((m) => m.participantId === P2)!.status).toBe("absent");
  });
});

describe("roster: URL state, rows, filters, sort and paging", () => {
  test("parse and print the URL; junk falls back to defaults", () => {
    expect(parseRosterFilters({})).toEqual({ view: "all", q: "", cohort: null });
    expect(parseRosterFilters({ view: "mine", q: "  ava  ", cohort: COHORT_A.toUpperCase() })).toEqual({ view: "mine", q: "ava", cohort: COHORT_A });
    expect(parseRosterFilters({ view: "everyone", cohort: "drop table" })).toEqual({ view: "all", q: "", cohort: null });
    expect(rosterFilterParams({ view: "all", q: "", cohort: null })).toEqual({});
    expect(rosterHref("/admin/programs/people", { view: "unenrolled", q: "b", cohort: null })).toBe("/admin/programs/people?view=unenrolled&q=b");
    expect(parseTableState({ sort: "rate", page: "2" }, ROSTER_TABLE)).toEqual({ page: 2, sort: { key: "rate", dir: "asc" } });
    expect(parseTableState({ sort: "secret" }, ROSTER_TABLE).sort).toEqual({ key: "name", dir: "asc" });
  });

  const today = "2026-11-21";
  const rows = buildRosterRows(
    {
      participants: [
        { id: P1, first_name: "Avery", last_name: "Lane", custom_fields: { guardian_phone: "555", grade: "9" } },
        { id: P2, first_name: "Blake", last_name: "Moss", custom_fields: {} },
        { id: P3, first_name: "Casey", last_name: "Nolan", custom_fields: { guardian_email: "g@example.org" } },
      ],
      memberships: [
        { cohort_id: COHORT_A, student_id: P1, status: "enrolled" },
        { cohort_id: COHORT_A, student_id: P2, status: "enrolled" },
        { cohort_id: COHORT_A, student_id: P3, status: "dropped" },
      ],
      cohorts: [{ id: COHORT_A, name: "Fall Group A", status: "active", owner_id: ME }],
      sessions: [
        { id: "s1", cohort_id: COHORT_A, session_date: "2026-11-01", status: "held" },
        { id: "s2", cohort_id: COHORT_A, session_date: "2026-11-08", status: "held" },
        { id: "s3", cohort_id: COHORT_A, session_date: "2026-11-15", status: "held" },
        { id: "s4", cohort_id: COHORT_A, session_date: "2026-11-24", status: "scheduled" },
      ],
      marks: [
        { session_id: "s1", student_id: P1, status: "present" },
        { session_id: "s2", student_id: P1, status: "excused" },
        { session_id: "s3", student_id: P1, status: "late" },
        { session_id: "s1", student_id: P2, status: "present" },
        { session_id: "s2", student_id: P2, status: "absent" },
        { session_id: "s3", student_id: P2, status: "absent" },
      ],
    },
    today,
  );
  const byId = (id: string) => rows.find((r) => r.id === id)!;

  test("rate is present+late over present+late+absent at held sessions; excused counts against no one", () => {
    expect(byId(P1)).toMatchObject({ attended: 2, counted: 2, rate: 1, lastAttended: "2026-11-15", consecutiveAbsences: 0 });
    expect(byId(P2)).toMatchObject({ attended: 1, counted: 3, consecutiveAbsences: 2 });
    // Dropped: not in a live cohort, no rate (null, never 0%).
    expect(byId(P3)).toMatchObject({ cohorts: [], rate: null });
  });

  test("next steps: follow up on two misses, enroll the unenrolled, otherwise the next session", () => {
    expect(byId(P2).next).toEqual({ text: "Follow up: missed the last 2", tone: "late" });
    expect(byId(P3).next.text).toBe("Enroll in a cohort");
    expect(byId(P1).next.text).toMatch(/^Next session /);
  });

  test("views: mine = enrolled in a cohort I own; unenrolled; follow-up; search and cohort filter", () => {
    const mine = new Set([COHORT_A]);
    const ids = (f: Parameters<typeof filterRoster>[1], m: Set<string> = mine) => filterRoster(rows, f, m).map((r) => r.id).sort();
    expect(ids({ view: "mine", q: "", cohort: null })).toEqual([P1, P2].sort());
    expect(ids({ view: "mine", q: "", cohort: null }, new Set())).toEqual([]);
    expect(ids({ view: "unenrolled", q: "", cohort: null })).toEqual([P3]);
    expect(ids({ view: "followup", q: "", cohort: null })).toEqual([P2]);
    expect(ids({ view: "all", q: "case", cohort: null })).toEqual([P3]);
    expect(ids({ view: "all", q: "", cohort: COHORT_A })).toEqual([P1, P2].sort());
  });

  test("sort keeps missing values last in both directions; paging slices on the server", () => {
    expect(sortRoster(rows, { key: "rate", dir: "asc" }).map((r) => r.id)).toEqual([P2, P1, P3]);
    expect(sortRoster(rows, { key: "rate", dir: "desc" }).map((r) => r.id)).toEqual([P1, P2, P3]);
    const page = pageRoster(rows, { page: 0, sort: { key: "name", dir: "asc" } }, { ...ROSTER_TABLE, pageSize: 2 });
    expect(page).toMatchObject({ total: 3, page: 0, pageSize: 2 });
    expect(page.rows.map((r) => r.id)).toEqual([P1, P2]);
  });
});

describe("import: cohort column and put-everyone-in-a-cohort", () => {
  const lookup = cohortLookup([{ id: COHORT_A, name: "Fall  Group A" }]);
  const base = { entity: "student" as const, defs: [], stageKeys: new Set<string>(), cohortsByName: lookup };

  test("a Cohort header auto-maps; the cell matches an open cohort by name, case and spacing aside", () => {
    expect(suggestMapping(["First name", "Cohort"], "student", [])).toEqual({ "First name": "first_name", Cohort: "cohort" });
    const r = buildRow({ first_name: "Avery", cohort: "fall group a" }, base);
    expect(r).toMatchObject({ ok: true, cohortId: COHORT_A });
    // Never written to the participant row.
    expect(r.ok && "cohort" in r.spine).toBe(false);
  });

  test("an unknown cohort is an invalid row; an empty cell falls back to the everyone choice", () => {
    expect(buildRow({ first_name: "Avery", cohort: "Spring" }, base)).toMatchObject({ ok: false });
    expect(buildRow({ first_name: "Avery", cohort: "" }, { ...base, defaultCohortId: COHORT_A })).toMatchObject({ ok: true, cohortId: COHORT_A });
    expect(buildRow({ first_name: "Avery" }, base)).not.toHaveProperty("cohortId");
  });
});

describe("Ambition Coach and cohort next steps", () => {
  const today = "2026-11-21";
  const m = { id: "m", status: "active", intro_sent_at: "2026-10-01", plan_shared_at: null, coach_reaction: null };

  test("coach matches: sessions met out of sessions due, null until one is due", () => {
    expect(coachMatchProgress(m, [], today)).toMatchObject({ done: 0, missed: 0, rate: null, next: { text: "Get session 1 on the calendar" } });
    const p = coachMatchProgress(m, [
      { n: 1, scheduled_on: "2026-10-10", done_at: "2026-10-10T18:00:00Z" },
      { n: 2, scheduled_on: "2026-11-01", done_at: null },
      { n: 3, scheduled_on: "2026-12-01", done_at: null },
    ], today);
    expect(p).toMatchObject({ done: 1, missed: 1, rate: 0.5, lastMet: "2026-10-10", next: { tone: "late" } });
    expect(coachMatchProgress({ ...m, status: "proposed", intro_sent_at: null }, [], today).next.text).toBe("Send the intro");
  });

  test("cohort record: a past session without attendance comes first and says how late", () => {
    const step = cohortNextStep({
      enrolled: 12,
      sessions: [
        { id: "a", session_date: "2026-11-17", status: "scheduled", marked: 0 },
        { id: "b", session_date: "2026-11-21", status: "scheduled", marked: 0 },
      ],
      today,
    });
    expect(step).toMatchObject({ action: "attendance", sessionId: "a", due: { text: "4 days late.", late: true } });
    const todayStep = cohortNextStep({ enrolled: 12, sessions: [{ id: "b", session_date: today, status: "scheduled", marked: 3 }], today });
    expect(todayStep).toMatchObject({ title: "Finish today's attendance.", sessionId: "b" });
    expect(cohortNextStep({ enrolled: 0, sessions: [], today })).toMatchObject({ action: "people", sessionId: null });
  });
});
