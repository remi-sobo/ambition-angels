import { describe, it, expect } from "vitest";
import { outcomeFor, parseScheduleAt, spreadMessage, spreadOverDays, PACE } from "@/lib/comms/queue-plan";

// Comms v2.2 G2 (specs/comms-v2-gmail-amendment.md): the send queue's rules.

describe("what a failed send becomes", () => {
  it("puts a message back in the queue and stops the org when the sender breaks or is limited", () => {
    expect(outcomeFor("auth")).toEqual({ status: "pending", stopOrg: true });
    expect(outcomeFor("paused")).toEqual({ status: "pending", stopOrg: true });
  });
  it("fails one refused message and carries on", () => {
    expect(outcomeFor("rejected")).toEqual({ status: "failed", stopOrg: false });
  });
  it("never retries an unclear send: it may have gone", () => {
    expect(outcomeFor("unknown")).toEqual({ status: "unknown", stopOrg: false });
  });
});

describe("spreading a campaign over the daily cap", () => {
  it("fits today when there's room", () => {
    expect(spreadOverDays(300, 400, 400)).toEqual({ today: 300, rest: 0, extraDays: 0 });
    expect(spreadMessage(300, 400, 400)).toBeNull();
  });
  it("carries the rest into following days", () => {
    expect(spreadOverDays(412, 400, 400)).toEqual({ today: 400, rest: 12, extraDays: 1 });
    expect(spreadMessage(412, 400, 400)).toBe("400 go today. At your daily limit of 400, the other 12 go over the next day.");
    expect(spreadOverDays(1000, 100, 400)).toEqual({ today: 100, rest: 900, extraDays: 3 });
  });
  it("says so when today's cap is already used up", () => {
    expect(spreadMessage(50, 0, 400)).toMatch(/used up/);
  });
});

describe("schedule time", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  it("treats no value as send now", () => {
    expect(parseScheduleAt(undefined, now)).toEqual({ at: null });
    expect(parseScheduleAt("", now)).toEqual({ at: null });
  });
  it("accepts a future time within 90 days", () => {
    expect(parseScheduleAt("2026-11-21T15:00:00Z", now).at?.toISOString()).toBe("2026-11-21T15:00:00.000Z");
  });
  it("refuses the past, the far future and garbage", () => {
    expect(parseScheduleAt("2026-11-20T11:00:00Z", now).error).toBeTruthy();
    expect(parseScheduleAt("2027-06-01T00:00:00Z", now).error).toBeTruthy();
    expect(parseScheduleAt("tomorrow", now).error).toBeTruthy();
    expect(parseScheduleAt(42, now).error).toBeTruthy();
  });
});

describe("pacing", () => {
  it("keeps Gmail gentle", () => {
    expect(PACE.gmail.concurrency).toBeLessThanOrEqual(2);
    expect(PACE.gmail.gapMs).toBeGreaterThanOrEqual(250);
  });
});
