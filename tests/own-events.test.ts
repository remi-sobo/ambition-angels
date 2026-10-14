import { describe, expect, test } from "vitest";
import { isOwnMeeting } from "@/lib/agenda/own-events";

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
