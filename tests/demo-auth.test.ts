import { describe, expect, it } from "vitest";
import {
  DEMO_COOKIE_PATH,
  cookieIsValid,
  demoCookieValue,
  passwordMatches,
  safeEqual,
} from "@/lib/demo/auth";

// The /demo gate (My Ambition partner demo). The contract: a password check
// that fails closed and leaks nothing through length, and a cookie that is a
// keyed HMAC — unforgeable without the secret, invalidated by rotating it.

describe("safeEqual", () => {
  it("is true only for identical strings, regardless of length", () => {
    expect(safeEqual("#Ambition2026!", "#Ambition2026!")).toBe(true);
    expect(safeEqual("#Ambition2026!", "#Ambition2026")).toBe(false);
    expect(safeEqual("a", "abcdefghijklmnop")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("passwordMatches", () => {
  const expected = "#Ambition2026!";
  it("accepts the exact password", () => {
    expect(passwordMatches(expected, expected)).toBe(true);
  });
  it("rejects near misses, empties, and non-strings", () => {
    expect(passwordMatches("#ambition2026!", expected)).toBe(false);
    expect(passwordMatches(" #Ambition2026!", expected)).toBe(false);
    expect(passwordMatches("", expected)).toBe(false);
    expect(passwordMatches(null, expected)).toBe(false);
    expect(passwordMatches(undefined, expected)).toBe(false);
  });
  it("fails closed when no password is configured", () => {
    expect(passwordMatches("anything", undefined)).toBe(false);
    expect(passwordMatches("", "")).toBe(false);
  });
});

describe("demo cookie", () => {
  const secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("is a 64-hex HMAC that verifies against the same secret", () => {
    const v = demoCookieValue(secret);
    expect(v).toMatch(/^[0-9a-f]{64}$/);
    expect(cookieIsValid(v, secret)).toBe(true);
  });
  it("cannot be forged: a different secret, a tweaked value, or a plain flag all fail", () => {
    const v = demoCookieValue(secret);
    expect(cookieIsValid(v, secret.replace("0", "1"))).toBe(false);
    expect(cookieIsValid(v.slice(0, -1) + (v.endsWith("0") ? "1" : "0"), secret)).toBe(false);
    expect(cookieIsValid("1", secret)).toBe(false);
    expect(cookieIsValid("ma-demo-v1", secret)).toBe(false);
  });
  it("fails closed with no secret or no cookie", () => {
    expect(cookieIsValid(demoCookieValue(secret), undefined)).toBe(false);
    expect(cookieIsValid(demoCookieValue(secret), "")).toBe(false);
    expect(cookieIsValid(undefined, secret)).toBe(false);
    expect(cookieIsValid("", secret)).toBe(false);
  });
  it("is scoped to /demo so it never rides along on the rest of the site", () => {
    expect(DEMO_COOKIE_PATH).toBe("/demo");
  });
});
