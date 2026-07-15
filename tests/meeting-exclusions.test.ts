import { describe, expect, test } from "vitest";
import { isRecurringInstance, seriesKey } from "@/lib/meetings/exclusions";

// The exclusion key must be stable across every instance of a recurring
// Google event (each instance has its own google_event_id under
// singleEvents: true), and must fall back sanely for rows synced before
// recurring_event_id existed.

describe("seriesKey", () => {
  test("prefers recurring_event_id when present", () => {
    expect(
      seriesKey({ google_event_id: "abc123_20260714T170000Z", recurring_event_id: "abc123" })
    ).toBe("abc123");
  });

  test("strips a timed-instance suffix when recurring_event_id is missing", () => {
    expect(seriesKey({ google_event_id: "abc123_20260714T170000Z" })).toBe("abc123");
    expect(seriesKey({ google_event_id: "abc123_20260714T170000" })).toBe("abc123");
  });

  test("strips an all-day instance suffix", () => {
    expect(seriesKey({ google_event_id: "abc123_20260714" })).toBe("abc123");
  });

  test('strips a "this and following" suffix (_R…)', () => {
    expect(seriesKey({ google_event_id: "abc123_R20260714T170000" })).toBe("abc123");
  });

  test("a one-off event keys on its own id", () => {
    expect(seriesKey({ google_event_id: "one0ff3vent" })).toBe("one0ff3vent");
  });

  test("two instances of the same series share a key", () => {
    const a = seriesKey({ google_event_id: "abc123_20260707T170000Z" });
    const b = seriesKey({ google_event_id: "abc123_20260714T170000Z" });
    expect(a).toBe(b);
  });

  test("null without a google id", () => {
    expect(seriesKey({ google_event_id: null, recurring_event_id: null })).toBeNull();
    expect(seriesKey({})).toBeNull();
  });
});

describe("isRecurringInstance", () => {
  test("true when recurring_event_id is set", () => {
    expect(isRecurringInstance({ google_event_id: "x", recurring_event_id: "abc123" })).toBe(true);
  });

  test("true when the google id carries an instance suffix (pre-backfill rows)", () => {
    expect(isRecurringInstance({ google_event_id: "abc123_20260714T170000Z" })).toBe(true);
    expect(isRecurringInstance({ google_event_id: "abc123_20260714" })).toBe(true);
  });

  test("false for a one-off event", () => {
    expect(isRecurringInstance({ google_event_id: "one0ff3vent" })).toBe(false);
    expect(isRecurringInstance({ google_event_id: null })).toBe(false);
  });
});
