import { describe, expect, test } from "vitest";
import {
  buildCommitRows,
  candidatePrepEventIds,
  lightWeekReason,
  type CommitTask,
} from "@/lib/admin/ops/commitments";

const EV = "11111111-2222-3333-4444-555555555555";
const base: Omit<CommitTask, "id" | "title"> = {
  planned_day: null,
  calendar_event_id: null,
  labels: [],
  estimated_minutes: null,
};
const ctx = (over: Partial<Parameters<typeof buildCommitRows>[1]> = {}) => ({
  orgId: "org",
  userId: "me",
  sessionId: "sess",
  weekOf: "2026-10-19",
  workBlockByTask: new Map<string, string>(),
  knownEventIds: new Set<string>(),
  ...over,
});

describe("buildCommitRows placement (first match wins)", () => {
  test("work block beats everything and carries its id", () => {
    const [r] = buildCommitRows(
      [{ ...base, id: "t", title: "T", planned_day: "2026-10-20", labels: [`prep:${EV}`] }],
      ctx({ workBlockByTask: new Map([["t", "blk"]]) })
    );
    expect(r.placement).toBe("block");
    expect(r.work_block_id).toBe("blk");
    expect(r.prep_for_event_id).toBeNull();
  });

  test("a task's own calendar block is a block with no work block id", () => {
    const [r] = buildCommitRows([{ ...base, id: "t", title: "T", calendar_event_id: "ce" }], ctx());
    expect(r.placement).toBe("block");
    expect(r.work_block_id).toBeNull();
  });

  test("prep links its event only when the event is known", () => {
    const tasks = [{ ...base, id: "t", title: "T", labels: [`prep:${EV}`, "prep"] }];
    expect(buildCommitRows(tasks, ctx({ knownEventIds: new Set([EV]) }))[0]).toMatchObject({
      placement: "prep",
      prep_for_event_id: EV,
    });
    expect(buildCommitRows(tasks, ctx())[0]).toMatchObject({ placement: "prep", prep_for_event_id: null });
  });

  test("day, then floating", () => {
    const rows = buildCommitRows(
      [
        { ...base, id: "a", title: "A", planned_day: "2026-10-21" },
        { ...base, id: "b", title: "B" },
      ],
      ctx()
    );
    expect(rows.map((r) => r.placement)).toEqual(["day", "floating"]);
    expect(rows[0].planned_day).toBe("2026-10-21");
  });

  test("every row is a backlog commit with the estimate and title snapshotted", () => {
    const [r] = buildCommitRows([{ ...base, id: "t", title: "Write grant", estimated_minutes: 90 }], ctx());
    expect(r).toMatchObject({
      decision: "commit",
      source: "backlog",
      task_title: "Write grant",
      estimated_minutes: 90,
      session_id: "sess",
      org_id: "org",
      user_id: "me",
      week_of: "2026-10-19",
    });
  });
});

describe("candidatePrepEventIds", () => {
  test("only uuid-shaped prep ids are looked up (bookings are not calendar_events)", () => {
    const ids = candidatePrepEventIds([
      { ...base, id: "a", title: "A", labels: [`prep:${EV}`] },
      { ...base, id: "b", title: "B", labels: ["prep:booking:abc"] },
      { ...base, id: "c", title: "C", labels: null },
    ]);
    expect(ids).toEqual([EV]);
  });
});

describe("lightWeekReason (an empty commit must say why)", () => {
  test("no reason needed when something is committed", () => {
    expect(lightWeekReason(3, undefined)).toBeNull();
  });
  test("an empty commit without a real reason is refused", () => {
    expect(lightWeekReason(0, undefined)).toBeUndefined();
    expect(lightWeekReason(0, "  ")).toBeUndefined();
    expect(lightWeekReason(0, "no")).toBeUndefined();
  });
  test("a reason is trimmed and kept", () => {
    expect(lightWeekReason(0, "  Board retreat all week  ")).toBe("Board retreat all week");
  });
});
