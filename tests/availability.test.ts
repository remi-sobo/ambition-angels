import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Module mocks must be hoisted via vi.mock; the actual implementations are
// replaced before lib/availability.ts is imported below.
vi.mock("../lib/google/calendar", () => ({
  getFreeBusy: vi.fn(),
}));
vi.mock("../lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import {
  HOST_TIMEZONE,
  getAvailableSlots,
  isoWeekdayInTz,
  mergeBusy,
  sliceSlots,
} from "../lib/availability";
import { getFreeBusy } from "../lib/google/calendar";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import type { MeetingType } from "../lib/database.types";

// ── Pure helpers ─────────────────────────────────────────────────────────

describe("isoWeekdayInTz", () => {
  // 2026-05-20 is a Wednesday everywhere on Earth.
  test("Wednesday → 3", () => {
    expect(isoWeekdayInTz(new Date("2026-05-20T12:00:00Z"), HOST_TIMEZONE)).toBe(3);
  });

  // 2026-05-17 is Sunday. At 04:00 UTC it's still Saturday in PT (UTC-7 DST)
  // — confirms the tz conversion runs.
  test("Saturday-in-PT despite UTC saying Sunday → 6", () => {
    expect(isoWeekdayInTz(new Date("2026-05-17T04:00:00Z"), HOST_TIMEZONE)).toBe(6);
  });

  test("Sunday in PT → 7 (ISO)", () => {
    expect(isoWeekdayInTz(new Date("2026-05-17T20:00:00Z"), HOST_TIMEZONE)).toBe(7);
  });
});

describe("mergeBusy", () => {
  test("empty → empty", () => {
    expect(mergeBusy([], 15)).toEqual([]);
  });

  test("single block expands by buffer on both sides", () => {
    const b = [{ start: new Date("2026-05-20T10:00:00Z"), end: new Date("2026-05-20T11:00:00Z") }];
    const merged = mergeBusy(b, 15);
    expect(merged).toHaveLength(1);
    expect(merged[0].start.toISOString()).toBe("2026-05-20T09:45:00.000Z");
    expect(merged[0].end.toISOString()).toBe("2026-05-20T11:15:00.000Z");
  });

  test("overlapping after padding → merged into one", () => {
    const b = [
      { start: new Date("2026-05-20T10:00:00Z"), end: new Date("2026-05-20T10:30:00Z") },
      { start: new Date("2026-05-20T10:45:00Z"), end: new Date("2026-05-20T11:00:00Z") },
    ];
    const merged = mergeBusy(b, 15);
    expect(merged).toHaveLength(1);
    expect(merged[0].start.toISOString()).toBe("2026-05-20T09:45:00.000Z");
    expect(merged[0].end.toISOString()).toBe("2026-05-20T11:15:00.000Z");
  });

  test("non-overlapping after padding → both preserved", () => {
    const b = [
      { start: new Date("2026-05-20T10:00:00Z"), end: new Date("2026-05-20T10:30:00Z") },
      { start: new Date("2026-05-20T13:00:00Z"), end: new Date("2026-05-20T13:30:00Z") },
    ];
    expect(mergeBusy(b, 15)).toHaveLength(2);
  });

  test("unsorted input sorts before merge", () => {
    const b = [
      { start: new Date("2026-05-20T13:00:00Z"), end: new Date("2026-05-20T13:30:00Z") },
      { start: new Date("2026-05-20T10:00:00Z"), end: new Date("2026-05-20T10:30:00Z") },
    ];
    const merged = mergeBusy(b, 0);
    expect(merged[0].start.getTime()).toBeLessThan(merged[1].start.getTime());
  });
});

describe("sliceSlots", () => {
  const baseArgs = {
    windowStart: new Date("2026-05-20T16:00:00Z"),    // 9am PT
    windowEnd: new Date("2026-05-21T00:00:00Z"),      // 5pm PT
    effectiveStart: new Date("2026-05-20T16:00:00Z"),
    durationMinutes: 30,
    busy: [],
  };

  test("no busy, no notice clamp → fills window", () => {
    const s = sliceSlots(baseArgs);
    expect(s).toHaveLength(16);                       // 8h / 30min
  });

  test("effectiveStart inside window drops early slots", () => {
    const s = sliceSlots({
      ...baseArgs,
      effectiveStart: new Date("2026-05-20T18:00:00Z"), // 11am PT
    });
    expect(s).toHaveLength(12);                       // 6h / 30min
    expect(s[0].start.toISOString()).toBe("2026-05-20T18:00:00.000Z");
  });

  test("busy block in middle drops overlapping slots", () => {
    const s = sliceSlots({
      ...baseArgs,
      busy: [
        // 11:00-12:00 PT busy → drops 11:00 and 11:30 slots
        { start: new Date("2026-05-20T18:00:00Z"), end: new Date("2026-05-20T19:00:00Z") },
      ],
    });
    expect(s).toHaveLength(14);
    expect(s.some((x) => x.start.toISOString() === "2026-05-20T18:00:00.000Z")).toBe(false);
    expect(s.some((x) => x.start.toISOString() === "2026-05-20T18:30:00.000Z")).toBe(false);
  });

  test("duration larger than window → no slots", () => {
    expect(
      sliceSlots({ ...baseArgs, durationMinutes: 600 })
    ).toEqual([]);
  });

  test("slot ending exactly at windowEnd is included", () => {
    const s = sliceSlots({
      ...baseArgs,
      windowEnd: new Date("2026-05-20T16:30:00Z"),    // single 30-min slot
    });
    expect(s).toHaveLength(1);
  });

  test("buffer overlap at slot boundary blocks slot", () => {
    // Busy 10:00-10:30 PT padded ±15min = 09:45-10:45 PT. The 30-min slots
    // that overlap this padded range: 09:30 (ends 10:00, overlaps), 10:00
    // (overlaps), 10:30 (starts 10:30 < 10:45 end, overlaps). 11:00 is the
    // first clean slot afterwards.
    const s = sliceSlots({
      ...baseArgs,
      busy: mergeBusy(
        [{ start: new Date("2026-05-20T17:00:00Z"), end: new Date("2026-05-20T17:30:00Z") }],
        15
      ),
    });
    const starts = s.map((x) => x.start.toISOString());
    expect(starts).not.toContain("2026-05-20T16:30:00.000Z");
    expect(starts).not.toContain("2026-05-20T17:00:00.000Z");
    expect(starts).not.toContain("2026-05-20T17:30:00.000Z");
    expect(starts).toContain("2026-05-20T18:00:00.000Z");
  });
});

// ── getAvailableSlots integration (with mocks) ───────────────────────────

function makeMeetingType(over: Partial<MeetingType> = {}): MeetingType {
  return {
    id: "type-1",
    slug: "donor-conversation",
    name: "Donor Conversation",
    duration_minutes: 30,
    duration_options: null,
    location_options: ["video"],
    default_in_person_address: null,
    description: null,
    prep_notes: null,
    who_its_for: null,
    color: null,
    icon_name: null,
    buffer_minutes: 15,
    min_notice_hours: 24,
    max_advance_days: 30,
    available_days: [1, 2, 3, 4, 5],
    available_start_time: "09:00:00",
    available_end_time: "17:00:00",
    daily_limit: null,
    is_active: true,
    sort_order: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

/** Returns a query-chain stub that resolves to the next item in `queue`. */
function chainQueue(queue: Array<{ data?: unknown; count?: number | null }>) {
  const make = () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "gt", "lte", "lt"]) {
      chain[m] = vi.fn(() => chain);
    }
    chain.then = (resolve: (v: unknown) => unknown) => {
      const next = queue.shift() ?? { data: [], count: 0 };
      return Promise.resolve(resolve(next));
    };
    return chain;
  };
  return { from: vi.fn(() => make()) };
}

beforeEach(() => {
  vi.useFakeTimers();
  // Pin "now" to 2026-05-19 16:00 UTC (Tue 09:00 PT) so day-of-week math
  // and min_notice windows are deterministic across the test run.
  vi.setSystemTime(new Date("2026-05-19T16:00:00Z"));
  vi.mocked(getFreeBusy).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("getAvailableSlots", () => {
  test("past date → []", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(chainQueue([]) as never);
    const slots = await getAvailableSlots({
      meetingType: makeMeetingType(),
      date: new Date("2026-05-10T16:00:00Z"),
      attendeeTimezone: "America/Los_Angeles",
    });
    expect(slots).toEqual([]);
  });

  test("beyond max_advance_days → []", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(chainQueue([]) as never);
    const slots = await getAvailableSlots({
      meetingType: makeMeetingType({ max_advance_days: 7 }),
      date: new Date("2026-06-15T16:00:00Z"),
      attendeeTimezone: "America/Los_Angeles",
    });
    expect(slots).toEqual([]);
  });

  test("weekday not in available_days → []", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(chainQueue([]) as never);
    // 2026-05-23 is Saturday (ISO 6); meeting allows only Mon-Fri.
    const slots = await getAvailableSlots({
      meetingType: makeMeetingType(),
      date: new Date("2026-05-23T16:00:00Z"),
      attendeeTimezone: "America/Los_Angeles",
    });
    expect(slots).toEqual([]);
  });

  test("blanket blackout (meeting_type_ids null) → []", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      chainQueue([{ data: [{ meeting_type_ids: null }] }]) as never
    );
    const slots = await getAvailableSlots({
      meetingType: makeMeetingType(),
      date: new Date("2026-05-21T16:00:00Z"),       // Thu, > 24h notice
      attendeeTimezone: "America/Los_Angeles",
    });
    expect(slots).toEqual([]);
  });

  test("blackout for a different type is ignored", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      chainQueue([
        { data: [{ meeting_type_ids: ["other-type"] }] },  // blackout check
        { data: [] },                                       // bookings-as-busy
      ]) as never
    );
    const slots = await getAvailableSlots({
      meetingType: makeMeetingType(),
      date: new Date("2026-05-21T16:00:00Z"),
      attendeeTimezone: "America/Los_Angeles",
    });
    expect(slots.length).toBeGreaterThan(0);
  });

  test("daily_limit reached → []", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      chainQueue([
        { data: [] },                  // blackout check: none
        { count: 2 },                  // bookings-count: equals daily_limit
      ]) as never
    );
    const slots = await getAvailableSlots({
      meetingType: makeMeetingType({ daily_limit: 2 }),
      date: new Date("2026-05-21T16:00:00Z"),
      attendeeTimezone: "America/Los_Angeles",
    });
    expect(slots).toEqual([]);
  });

  test("min_notice past end of day → []", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(chainQueue([]) as never);
    // Now: 2026-05-19 09:00 PT. min_notice 48h pushes earliest bookable to
    // 2026-05-21 09:00 PT. Same-day 2026-05-19 has no bookable slots.
    const slots = await getAvailableSlots({
      meetingType: makeMeetingType({ min_notice_hours: 48 }),
      date: new Date("2026-05-19T16:00:00Z"),
      attendeeTimezone: "America/Los_Angeles",
    });
    expect(slots).toEqual([]);
  });

  test("happy path: clear day → full grid of 30-min slots", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      chainQueue([
        { data: [] },                  // blackout check
        { data: [] },                  // bookings-as-busy
      ]) as never
    );
    const slots = await getAvailableSlots({
      meetingType: makeMeetingType(),
      date: new Date("2026-05-21T16:00:00Z"),   // Thu, well past 24h notice
      attendeeTimezone: "America/Los_Angeles",
    });
    // 09:00 to 17:00 PT = 8h, 30-min slots → 16
    expect(slots).toHaveLength(16);
    expect(slots[0].start.toISOString()).toBe("2026-05-21T16:00:00.000Z");
    expect(slots[slots.length - 1].end.toISOString()).toBe("2026-05-22T00:00:00.000Z");
  });

  test("Google busy block removes overlapping slots", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      chainQueue([{ data: [] }, { data: [] }]) as never
    );
    // Busy 11:00-12:00 PT on the target day.
    vi.mocked(getFreeBusy).mockResolvedValue([
      { start: new Date("2026-05-21T18:00:00Z"), end: new Date("2026-05-21T19:00:00Z") },
    ]);
    const slots = await getAvailableSlots({
      meetingType: makeMeetingType(),
      date: new Date("2026-05-21T16:00:00Z"),
      attendeeTimezone: "America/Los_Angeles",
    });
    // Buffer 15min ±, so 10:45-12:15 PT is blocked → 10:30, 11:00, 11:30,
    // 12:00 all dropped. 4 slots gone from 16 → 12.
    expect(slots).toHaveLength(12);
  });
});
