import { describe, expect, test } from "vitest";
import { isOwnMeeting, projectOwnEvents, summarizeOwnWeek } from "@/lib/agenda/own-events";
import { weekDays } from "@/lib/admin/ops/week";
import { buildMondayStatus } from "@/lib/admin/ops/statusLine";
import type { AgendaItem } from "@/lib/agenda/service";

const ME = "user-me";
const REPORT = "user-report";

describe("isOwnMeeting (status line + grid share one owner rule)", () => {
  test("the owner's own google event counts", () => {
    expect(isOwnMeeting({ ownerUserId: ME, source: "google" }, ME, true)).toBe(true);
  });

  test("a direct report's or delegator's event does not count on my week", () => {
    expect(isOwnMeeting({ ownerUserId: REPORT, source: "google" }, ME, true)).toBe(false);
  });

  test("work-block mirrors never count as meetings, even my own", () => {
    expect(isOwnMeeting({ ownerUserId: ME, source: "bloomos" }, ME, true)).toBe(false);
  });

  test("owner-less bookings land on the viewer's own week only", () => {
    const booking = { ownerUserId: null, source: "booking" as const };
    expect(isOwnMeeting(booking, ME, true)).toBe(true);
    expect(isOwnMeeting(booking, REPORT, false)).toBe(false);
  });

  test("viewing a report's week keeps their events, not mine", () => {
    expect(isOwnMeeting({ ownerUserId: REPORT, source: "google" }, REPORT, false)).toBe(true);
    expect(isOwnMeeting({ ownerUserId: ME, source: "google" }, REPORT, false)).toBe(false);
  });
});


// Week of Mon Oct 12 2026; LA is UTC-7 (PDT). laT("10-12", "09:00") is 9am LA.
const laT = (md: string, hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return new Date(Date.UTC(2026, Number(md.slice(0, 2)) - 1, Number(md.slice(3)), h + 7, m)).toISOString();
};
const ev = (owner: string | null, md: string, s: string, e: string, source: AgendaItem["source"] = "google"): AgendaItem => ({
  id: `${owner}-${md}-${s}`,
  ownerUserId: owner,
  title: "x",
  start: laT(md, s),
  end: laT(md, e),
  allDay: false,
  location: null,
  isExternal: false,
  source,
});

describe("summarizeOwnWeek (status line and grid read the same minutes)", () => {
  const days = weekDays("2026-10-12");
  const prefs = { dayStartMinute: 9 * 60, dayEndMinute: 17 * 60 };
  const items: AgendaItem[] = [
    ev(ME, "10-12", "06:30", "07:30"), // before work: meeting time, not busy time
    ev(ME, "10-12", "09:00", "09:50"),
    ev(ME, "10-12", "09:45", "10:30"), // overlaps the 9:00, merged
    ev(ME, "10-13", "16:30", "18:30"), // half inside work hours
    ev(REPORT, "10-13", "10:00", "12:00"), // a report's meeting: not mine
    ev(ME, "10-14", "13:00", "14:00", "bloomos"), // block mirror: not a meeting
  ];

  test("only my events, overlaps merged, open time clipped to working hours", () => {
    const { timed } = projectOwnEvents(items, { ownerUserId: ME, isSelf: true, days });
    expect(timed).toHaveLength(4);
    const s = summarizeOwnWeek({ days, timed, blocks: [], prefs, blockTasksTotal: 0, blockTasksDone: 0 });
    expect(s.meetingMin).toBe(60 + 90 + 120);
    expect(s.openMin).toBe(5 * 480 - 90 - 30);
  });

  test("a manager with no events of their own reads 0m, not the report's hours", () => {
    const { timed } = projectOwnEvents([items[4]], { ownerUserId: ME, isSelf: true, days });
    const s = summarizeOwnWeek({ days, timed, blocks: [], prefs, blockTasksTotal: 0, blockTasksDone: 0 });
    expect(s.meetingMin).toBe(0);
    expect(s.openMin).toBe(5 * 480);
  });

  test("work blocks are busy time but not meeting time", () => {
    const s = summarizeOwnWeek({
      days,
      timed: [],
      blocks: [{ day: "2026-10-14", startMin: 13 * 60, endMin: 14 * 60 }],
      prefs,
      blockTasksTotal: 0,
      blockTasksDone: 0,
    });
    expect(s.meetingMin).toBe(0);
    expect(s.openMin).toBe(5 * 480 - 60);
  });
});

describe("buildMondayStatus speaks in minutes", () => {
  const base = { open: 4, areas: 2, carriedOver: 0 };

  test("meeting and open segments use the grid's hour format", () => {
    const s = buildMondayStatus("owner", { ...base, meetingMin: 270, openMin: 1965 });
    expect(s.sentence).toBe("This week: 4 open across 2 areas, 0 carried over, 4h 30m in meetings, 32h 45m open.");
    expect(s.tone).toBe("calm");
  });

  test("under five open hours flares", () => {
    const s = buildMondayStatus("staff", { ...base, meetingMin: 2100, openMin: 240 });
    expect(s.segments.find((x) => x.key === "hours")?.flare).toBe(true);
  });
});
