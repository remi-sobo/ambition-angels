import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// The limiter reads Date.now() and keeps state in a module-level Map, so each
// test uses a unique key and fake timers to stay isolated and deterministic.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit", () => {
  test("allows up to the limit, then blocks", () => {
    const key = "test-allow-block";
    const opts = { limit: 3, windowMs: 60_000 };
    expect(rateLimit(key, opts).allowed).toBe(true);
    expect(rateLimit(key, opts).allowed).toBe(true);
    const third = rateLimit(key, opts);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect(rateLimit(key, opts).allowed).toBe(false); // 4th over a limit of 3
  });

  test("keys are independent", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(rateLimit("test-key-a", opts).allowed).toBe(true);
    expect(rateLimit("test-key-a", opts).allowed).toBe(false);
    // A different key (e.g. a different IP) is unaffected.
    expect(rateLimit("test-key-b", opts).allowed).toBe(true);
  });

  test("resets after the window elapses", () => {
    const key = "test-reset";
    const opts = { limit: 1, windowMs: 60_000 };
    expect(rateLimit(key, opts).allowed).toBe(true);
    expect(rateLimit(key, opts).allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(rateLimit(key, opts).allowed).toBe(true); // window rolled over
  });
});

describe("getClientIp", () => {
  test("takes the leftmost x-forwarded-for entry", () => {
    const req = new Request("https://x.test", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  test("falls back to x-real-ip, then 'unknown'", () => {
    expect(getClientIp(new Request("https://x.test", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(getClientIp(new Request("https://x.test"))).toBe("unknown");
  });
});
